/*** Rain Z-Way HA module *******************************************

Version: 1.10
(c) Maroš Kollár, 2015-2017
-----------------------------------------------------------------------------
Author: Maroš Kollár <maros@k-1.com>
Description:
    This module checks weather condition and optional binary sensors to
    detect rain

******************************************************************************/

function Rain (id, controller) {
    // Call superconstructor first (AutomationModule)
    Rain.super_.call(this, id, controller);

    this.weatherAlert       = undefined;
    this.weatherUndergound  = undefined;
    this.forecastIO         = undefined;
    this.openWeather        = undefined;
    this.timeout            = undefined;
    this.popThreshold       = undefined;
    this.callback           = undefined;
    this.interval           = undefined;
    this.pollTimeout        = undefined;
}

inherits(Rain, BaseModule);

_module = Rain;

// ----------------------------------------------------------------------------
// --- Module instance initialized
// ----------------------------------------------------------------------------

Rain.prototype.init = function (config) {
    Rain.super_.prototype.init.call(this, config);

    var self = this;
    self.popThreshold   = config.popThreshold;
    self.callback       = _.bind(self.checkRain,self);

    // Create vdev
    self.vDev = this.controller.devices.create({
        deviceId: "Rain_" + self.id,
        defaults: {
            metrics: {
                title: self.langFile.m_title,
                level: 'off',
                rain: 'off',
                sources: [],
                lastRain: 0,
                icon: self.imagePath+'/icon_norain.png'
            }
        },
        overlay: {
            probeType: 'rain',
            deviceType: 'sensorBinary',
        },
        handler: function (command,args){
            if (command === 'update'
                && typeof(args) !== 'undefined') {
                self.checkRain('update');
            }
        },
        moduleId: this.id
    });

    setTimeout(_.bind(self.initCallback,self),60*1000);
    self.interval = setInterval(_.bind(self.checkRain,self,'interval'),10*60*1000);
};

Rain.prototype.initCallback = function() {
    var self = this;

    self.processDeviceList(self.config.rainSensors,function(deviceObject) {
        deviceObject.on('change:metrics:level',self.callback);
    });

    self.controller.devices.each(function(vDev) {
        var deviceType = vDev.get('deviceType');
        if (deviceType === 'sensorMultilevel') {
            if (vDev.get('metrics:probeTitle') === 'WeatherUndergoundCurrent') {
                self.weatherUndergound = vDev;
                self.log('Bind to '+vDev.id);
                vDev.on('change:metrics:updateTime',self.callback);
            } else if (vDev.get('metrics:probeTitle') === 'ForecastIOCurrent') {
                self.forecastIO = vDev;
                self.log('Bind to '+vDev.id);
                vDev.on('change:metrics:updateTime',self.callback);
            } else if (vDev.get('metrics:probeTitle') === 'WeatherAlert'
                && _.intersection(vDev.get('alertType'),['rain','snow','thunderstorm','freezing_rain']).length > 0) {
                self.weatherAlert = vDev;
                self.log('Bind to '+vDev.id);
                vDev.on('change:metrics:updateTime',self.callback);
            }
        } else if (deviceType === 'sensorMultiline'
            && vDev.get('metrics:multilineType') === 'openWeather') {
            self.openWeather = vDev;
            self.log('Bind to '+vDev.id);
            vDev.on('change:metrics:zwaveOpenWeather',self.callback);
        }
    });

    // Reinit rain timeout
    if (typeof(self.config.timeout) !== 'undefined'
        && parseInt(self.config.timeout,10) > 0) {
        // Reinit timeout
        var now         = Math.floor(new Date().getTime() / 1000);
        var timeout     = parseInt(self.config.timeout,10);
        var lastRain    = self.vDev.get('metrics:lastRain');
        var limit       = lastRain + (timeout * 60);
        var timeoutLeft = limit - now;
        if (timeoutLeft > 60) {
            self.log('Restart timeout');
            self.startRainTimeout(timeoutLeft);
        } else {
            self.resetRain();
        }
    } else {
        // Initially turn off
        self.resetRain();
    }
    self.nextPoll();

    self.checkRain('init');
};

Rain.prototype.stop = function () {
    var self = this;

    if (self.vDev) {
        self.controller.devices.remove(self.vDev.id);
        self.vDev = undefined;
    }

    if (typeof(self.weatherUndergound) !== 'undefined') {
        self.weatherUndergound.off('change:metrics:change',self.callback);
    }
    if (typeof(self.openWeather) !== 'undefined') {
        self.openWeather.off('change:metrics:change',self.callback);
    }
    if (typeof(self.forecastIO) !== 'undefined') {
        self.forecastIO.off('change:metrics:change',self.callback);
    }
    if (typeof(self.weatherAlert) !== 'undefined') {
        self.weatherAlert.off('change:metrics:change',self.callback);
    }

    self.processDeviceList(self.config.rainSensors,function(deviceObject) {
        deviceObject.off('change:metrics:level',self.callback);
    });

    self.clearRainTimeout();
    self.clearPollTimeout();

    clearInterval(self.interval);
    self.interval = undefined;

    self.callback = undefined;

    Rain.super_.prototype.stop.call(this);
};

// ----------------------------------------------------------------------------
// --- Module methods
// ----------------------------------------------------------------------------

Rain.prototype.nextPoll = function() {
    var self    = this;
    // No poll
    if (typeof(self.config.rainSensorPoll) === 'undefined'
        || self.config.rainSensorPoll === 0) {
        return;
    }

    var poll    = self.config.rainSensorPoll;
    var pop     = self.vDev.get('metrics:pop');
    if (typeof(pop) === 'number') {
        poll = poll * pop / 100;
    }
    poll = Math.max(poll,60);
    poll = poll * 1000;

    self.clearPollTimeout();
    self.pollTimeout = setTimeout(_.bind(self.pollSensor,self),poll);
    return;
};

Rain.prototype.clearPollTimeout = function() {
    var self    = this;
    if (typeof(self.pollTimeout) !== 'undefined') {
        clearTimeout(self.pollTimeout);
    }
    self.pollTimeout = undefined;
    return;
};

Rain.prototype.pollSensor = function() {
    var self    = this;

    self.log('Poll rain sensors');
    self.processDeviceList(self.config.rainSensors,function(deviceObject) {
        deviceObject.performCommand('update');
    });
    self.nextPoll();
};

Rain.prototype.checkRain = function(trigger) {
    var self        = this;
    var rain        = false;
    var level       = self.vDev.get('metrics:level');
    var hasTimeout  = (typeof(self.timeout) !== 'undefined');
    var maxIntensity= parseFloat(self.config.intensityThreshold)  || 0;
    var popThreshold= parseFloat(self.config.popThreshold) || 0;
    var now         = Math.floor(new Date().getTime() / 1000);
    var sources     = [];
    var pop         = null;
    var condition,intensity;
    trigger         = typeof(trigger) === 'string' ? trigger : trigger.id;

    self.log('Check rain (max intensity '+maxIntensity+', triggered by '+trigger+')');

    self.processDeviceList(self.config.rainSensors,function(deviceObject) {
        if (deviceObject.get('metrics:level') === 'on') {
            rain = true;
            sources.push(deviceObject.id+'/metrics:level');
            self.log('Detected rain from sensor');
        }
    });

    // Handle WeatherUndergound Module
    if (typeof(self.weatherUndergound) !== 'undefined') {
        condition   = self.weatherUndergound.get('metrics:conditiongroup');
        intensity   = self.weatherUndergound.get('metrics:percipintensity');
        pop         = self.weatherUndergound.get('metrics:pop');
        if (condition === 'poor'
            || condition === 'snow') {
            self.log('Detected rain from WeatherUnderground condition: '+condition);
            sources.push(self.weatherUndergound.id+'/metrics:conditiongroup');
            rain = true;
        } else if (intensity >= maxIntensity) {
            self.log('Detected rain from WeatherUnderground percipintensity: '+intensity);
            sources.push(self.weatherUndergound.id+'/metrics:percipintensity');
            rain = true;
        } else if (typeof(self.config.popThreshold) !== 'undefined'
            && popThreshold > 0
            && pop >= popThreshold) {
            self.log('Detected rain from WeatherUnderground pop');
            rain = true;
            sources.push(self.weatherUndergound.id+'/metrics:pop');
        }
    }

    // Handle ForecastIO Module
    if (typeof(self.forecastIO) !== 'undefined') {
        condition   = self.forecastIO.get('metrics:conditiongroup');
        intensity   = self.forecastIO.get('metrics:percipintensity');
        pop         = self.forecastIO.get('metrics:pop');
        if (condition === 'poor'
            || condition === 'snow') {
            self.log('Detected rain from ForecastIO condition: '+condition);
            rain = true;
            sources.push(self.forecastIO.id+'/metrics:conditiongroup');
        } else if (intensity >= maxIntensity) {
            self.log('Detected rain from ForecastIO percipintensity: '+intensity);
            rain = true;
            sources.push(self.forecastIO.id+'/metrics:percipintensity');
        } else if (typeof(self.config.popThreshold) !== 'undefined'
            && popThreshold > 0
            && pop >= popThreshold) {
            self.log('Detected rain from ForecastIO pop');
            rain = true;
            sources.push(self.forecastIO.id+'/metrics:pop');
        }
    }

    // Handle WeatherAlert Module
    if (typeof(self.weatherAlert) !== 'undefined') {
        condition = self.weatherAlert.get('metrics:type');
        if (level > 2) {
            self.log('Detected rain from WeatherAlert level: '+level);
            rain = true;
            sources.push(self.weatherAlert.id+'/metrics:conditiongroup');
        }
    }

    // Handle OpenWeather Module
    if (typeof(self.openWeather) !== 'undefined') {
        condition = self.openWeather.get('metrics:zwaveOpenWeather');
        // see http://openweathermap.org/weather-conditions
        if (_.contains([
                200, 201, 202, 210, 211, 212, 221, 230, 231, 232,
                300, 301, 302, 310, 311, 312, 313, 314, 321,
                500, 501, 502, 503, 504, 511, 520, 521, 522, 531,
                600, 601, 602, 611, 612, 615, 616, 620, 621, 622,
                771,
                901, 902, 906, 960, 961, 962
            ],condition.weather[0].id)) {
            self.log('Detected rain from OpenWeather');
            rain = true;
            sources.push(self.openWeather.id+'/metrics:zwaveOpenWeather:condition:weather:0:id');
        }
    }

    self.vDev.set('metrics:pop',pop);
    if (rain) {
        self.vDev.set('metrics:icon',self.imagePath+'/icon.png');
        self.vDev.set('metrics:level','on');
        self.vDev.set('metrics:rain','on');
        self.vDev.set('metrics:lastRain',now);
    } else {
        self.vDev.set('metrics:rain','off');
        self.log('No rain detected');
    }
    self.vDev.set('metrics:sources',sources);

    // Reset timeout on new rain
    if (rain
        && hasTimeout) {
        self.log('Detected rain start during timeout');
        self.clearRainTimeout();
        hasTimeout = false;
        return;
    // New rain
    } else if (rain
        && level === 'off') {
        self.log('Detected rain start');
        self.vDev.set('metrics:change',Math.floor(new Date().getTime() / 1000));
        self.controller.emit("rain.start");
        var openWindows = [];
        self.processDeviceList(self.config.windows,function(deviceObject) {
            if (deviceObject.get('metrics:level') === 'off') {
                return;
            }
            var location    = deviceObject.get('location');
            var room        = _.find(
                self.controller.locations,
                function(item){ return (item.id === location); }
            );

            var message     = deviceObject.get('metrics:title');
            if (typeof(room) === 'object') {
                message = message + ' (' + room.title + ')';
            }

            self.log('msg'+message);
            openWindows.push(message);
        });

        if (openWindows.length > 0) {
            var message =  self.langFile.rain_window + '\n' + openWindows.join('\n');
            self.controller.addNotification(
                "warning",
                message,
                "module",
                "Rain"
            );

            self.controller.emit("security.rain.alarm",{
                id:         self.id,
                title:      self.vDev.get('metrics:title'),
                location:   self.vDev.get('metrics:location'),
                type:       "rain",
                event:      "alarm",
                message:    message
            });
        }
        return;
    // Stop rain
    } else if (! rain
        && level === 'on'
        && ! hasTimeout) {

        // Timeout
        if (typeof(self.config.timeout) !== 'undefined'
            && parseInt(self.config.timeout,10) > 0) {
            self.log('Detected rain end. Start timeout');
            self.startRainTimeout();
        // Imediate off
        } else {
            self.resetRain();
        }
    }
};

Rain.prototype.startRainTimeout = function(timeout) {
    var self        = this;
    timeout         = timeout || parseInt(self.config.timeout,10);

    self.clearRainTimeout();
    self.vDev.set('metrics:icon',self.imagePath+'/icon_timeout.png');
    self.timeout = setTimeout(
        _.bind(self.resetRain,self),
        (timeout * 1000 * 60)
    );
};

Rain.prototype.clearRainTimeout = function() {
    var self        = this;
    if (typeof(self.timeout) !== 'undefined') {
        clearTimeout(self.timeout);
    }
    self.timeout = undefined;
};

Rain.prototype.resetRain = function() {
    var self        = this;
    self.clearRainTimeout();
    var level       = self.vDev.get('metrics:level');
    self.log('Untrigger rain sensor');
    self.vDev.set('metrics:level','off');
    self.vDev.set('metrics:change',Math.floor(new Date().getTime() / 1000));
    self.vDev.set('metrics:icon',self.imagePath+'/icon_norain.png');
    self.vDev.set('metrics:sources',[]);

    if (level === 'on') {
        self.controller.emit("rain.stop");
    }
};
