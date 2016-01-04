/*** Rain Z-Way HA module *******************************************

Version: 1.04
(c) Maroš Kollár, 2015
-----------------------------------------------------------------------------
Author: Maroš Kollár <maros@k-1.com>
Description:
    This module checks weather condition and optional binary sensors to
    detect rain

******************************************************************************/

function Rain (id, controller) {
    // Call superconstructor first (AutomationModule)
    Rain.super_.call(this, id, controller);
    
    this.weatherUndergound  = undefined;
    this.forecastIO         = undefined;
    this.openWeather        = undefined;
    this.timeout            = undefined;
    this.popThreshold       = undefined;
    this.callback           = undefined;
    this.interval           = undefined;
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
                probeTitle: 'Rain',
                title: self.langFile.title,
                level: 'off',
                rain: 'off',
                sources: [],
                icon: '/ZAutomation/api/v1/load/modulemedia/Rain/icon_norain.png'
            }
        },
        overlay: {
            deviceType: 'sensorBinary',
            probeTitle: 'Rain'
        },
        handler: function (command,args){
            if (command === 'update'
                && typeof(args) !== 'undefined') {
                self.checkRain();
            }
        },
        moduleId: this.id
    });
    
    setTimeout(_.bind(self.initCallback,self),60*1000);
    self.interval = setInterval(_.bind(self.checkRain,self),15*60*1000);
};

Rain.prototype.initCallback = function() {
    var self = this;
    
    self.processDeviceList(self.config.rainSensors,function(deviceObject) {
        deviceObject.on('change:metrics:level',self.callback);
    });

    self.controller.devices.each(function(vDev) {
        var deviceType = vDev.get('deviceType');
        if (deviceType === 'sensorMultilevel'
            && vDev.get('metrics:probeTitle') === 'WeatherUndergoundCurrent') {
            self.weatherUndergound = vDev;
            self.log('Bind to '+vDev.id);
            vDev.on('change:metrics:updateTime',self.callback);
        } else if (deviceType === 'sensorMultilevel'
            && vDev.get('metrics:probeTitle') === 'ForecastIOCurrent') {
            self.forecastIO = vDev;
            self.log('Bind to '+vDev.id);
            vDev.on('change:metrics:updateTime',self.callback);
        } else if (deviceType === 'sensorMultiline'
            && vDev.get('metrics:multilineType') === 'openWeather') {
            self.openWeather = vDev;
            self.log('Bind to '+vDev.id);
            vDev.on('change:metrics:zwaveOpenWeather',self.callback);
        }
    });
    
    // Initially turn off
    self.resetRain();
    
    self.checkRain();
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

    self.processDeviceList(self.config.rainSensors,function(deviceObject) {
        deviceObject.off('change:metrics:level',self.callback);
    });
    
    if (typeof(self.timeout) !== 'undefined') {
        clearTimeout(self.timeout);
        self.timeout = undefined;
    }
    
    clearInterval(self.interval);
    self.interval = undefined;
    
    self.callback = undefined;
    
    Rain.super_.prototype.stop.call(this);
};

// ----------------------------------------------------------------------------
// --- Module methods
// ----------------------------------------------------------------------------

Rain.prototype.checkRain = function() {
    var self        = this;
    var rain        = false;
    var level       = self.vDev.get('metrics:level');
    var hasTimeout  = (typeof(self.timeout) !== 'undefined');
    var intensity   = parseFloat(self.config.intensityThreshold)  || 0;
    var pop         = parseFloat(self.config.popThreshold) || 0;
    var sources     = [];
    var condition;
    
    self.log('Check rain');
    
    self.processDeviceList(self.config.rainSensors,function(deviceObject) {
        if (deviceObject.get('metrics:level') === 'on') {
            rain = true;
            sources.push(deviceObject.id+'/metrics:level');
            self.log('Detected rain from sensor');
        }
    });
    
    // Handle WeatherUndergound Module
    if (typeof(self.weatherUndergound) !== 'undefined') {
        
        condition = self.weatherUndergound.get('metrics:conditiongroup');
        if (condition === 'poor'
            || condition === 'snow'
            || self.forecastIO.get('metrics:percipintensity') > intensity) {
            self.log('Detected rain from WeatherUnderground condition');
            sources.push(self.weatherUndergound.id+'/metrics:conditiongroup');
            rain = true;
        } else if (typeof(self.config.popThreshold) !== 'undefined'
            && self.weatherUndergound.get('metrics:pop') >= pop) {
            self.log('Detected rain from WeatherUnderground pop');
            rain = true;
            sources.push(self.weatherUndergound.id+'/metrics:pop');
        }
    }
    
    // Handle ForecastIO Module
    if (typeof(self.forecastIO) !== 'undefined') {
        condition = self.forecastIO.get('metrics:conditiongroup');
        if (self.forecastIO.get('metrics:percipintensity') > intensity
            || condition === 'poor'
            || condition === 'snow') {
            self.log('Detected rain from ForecastIO condition');
            rain = true;
            sources.push(self.forecastIO.id+'/metrics:conditiongroup');
        } else if (typeof(self.config.popThreshold) !== 'undefined'
            && self.forecastIO.get('metrics:pop') >= pop) {
            self.log('Detected rain from ForecastIO pop');
            rain = true;
            sources.push(self.forecastIO.id+'/metrics:pop');
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
    
    if (rain) {
        self.vDev.set('metrics:icon','/ZAutomation/api/v1/load/modulemedia/Rain/icon.png');
        self.vDev.set('metrics:level','on');
        self.vDev.set('metrics:rain','on');
    } else {
        self.vDev.set('metrics:rain','off');
        self.log('No rain detected');
    }
    self.vDev.set('metrics:sources',sources);
    
    // Reset timeout on new rain
    if (rain
        && hasTimeout) {
        self.log('Detected rain start during timeout');
        clearTimeout(self.timeout);
        self.timeout = undefined;
        hasTimeout = false;
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
    // Stop rain
    } else if (! rain
        && level === 'on'
        && ! hasTimeout) {
        
        // Timeout
        if (typeof(self.config.timeout) !== 'undefined'
            && parseInt(self.config.timeout,10) > 0) {
            self.log('Detected rain end. Start timeout');
            self.vDev.set('metrics:icon','/ZAutomation/api/v1/load/modulemedia/Rain/icon_timeout.png');
            self.timeout = setTimeout(
                _.bind(self.resetRain,self),
                (parseInt(self.config.timeout,10) * 1000 * 60)
            );
        // Imediate off
        } else {
            self.resetRain();
        }
    }
};

Rain.prototype.resetRain = function() {
    var self        = this;
    self.timeout    = undefined;
    var level       = self.vDev.get('metrics:level');
    self.log('Untrigger rain sensor');
    self.vDev.set('metrics:change',Math.floor(new Date().getTime() / 1000));
    self.vDev.set('metrics:level','off');
    self.vDev.set('metrics:icon','/ZAutomation/api/v1/load/modulemedia/Rain/icon_norain.png');
    self.vDev.set('metrics:sources',[]);
    
    if (level === 'on') {        
        self.controller.emit("rain.stop");
    }
};
