/*** Rain Z-Way HA module *******************************************

Version: 1.03
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
    
    this.langFile           = undefined;
    this.weatherUndergound  = undefined;
    this.forecastIO         = undefined;
    this.weatherOpen        = undefined;
    this.timeout            = undefined;
    this.popThreshold       = undefined;
    this.callback           = undefined;
}

inherits(Rain, AutomationModule);

_module = Rain;

// ----------------------------------------------------------------------------
// --- Module instance initialized
// ----------------------------------------------------------------------------

Rain.prototype.init = function (config) {
    Rain.super_.prototype.init.call(this, config);

    var self = this;
    self.langFile       = self.controller.loadModuleLang("Rain");
    self.popThreshold   = config.popThreshold;
    self.callback       = _.bind(self.checkRain,self);

    // Create vdev
    this.vDev = this.controller.devices.create({
        deviceId: "Rain_" + this.id,
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
    
    setTimeout(_.bind(self.initCallback,self),60000);
};

Rain.prototype.initCallback = function() {
    var self = this;
    
    _.each(self.config.rainSensors,function(deviceId) {
        var deviceObject = self.controller.devices.get(deviceId);
        if (typeof(deviceObject) === null) {
            console.error('[Rain] Could not find rain sensor device');
        } else {
            deviceObject.on('change:metrics:level',self.callback);
        }
    });

    self.controller.devices.each(function(vDev) {
        var deviceType = vDev.get('deviceType');
        if (deviceType === 'sensorMultilevel'
            && vDev.get('metrics:probeTitle') === 'WeatherUndergoundCurrent') {
            self.weatherUndergound = vDev;
            vDev.on('change:metrics:updateTime',self.callback);
        } else if (deviceType === 'sensorMultilevel'
            && vDev.get('metrics:probeTitle') === 'ForecastIOCurrent') {
            self.forecastIO = vDev;
            vDev.on('change:metrics:updateTime',self.callback);
        } else if (deviceType === 'sensorMultiline'
            && vDev.get('metrics:multilineType') === 'openWeather') {
            self.weatherOpen = vDev;
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
    if (typeof(self.weatherOpen) !== 'undefined') {
        self.weatherOpen.off('change:metrics:change',self.callback);
    }
    if (typeof(self.forecastIO) !== 'undefined') {
        self.forecastIO.off('change:metrics:change',self.callback);
    }

    _.each(self.config.rainSensors,function(deviceId) {
        var deviceObject = self.controller.devices.get(deviceId);
        if (typeof(deviceObject) === null) {
            return;
        }
        deviceObject.off('change:metrics:level',self.callback);
    });
    
    if (typeof(self.timeout) !== 'undefined') {
        clearTimeout(self.timeout);
        self.timeout = undefined;
    }
    
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
    var hasTimeout = (typeof(self.timeout) !== 'undefined');
    var sources     = [];
    var condition;
    
    _.each(self.config.rainSensors,function(deviceId) {
        var deviceObject = self.controller.devices.get(deviceId);
        if (deviceObject !== null
            && deviceObject.get('metrics:level') === 'on') {
            rain = true;
            sources.push(deviceId);
            console.log('[Rain] Detected rain from sensor');
        }
    });
    
    // Handle WeatherUndergound Module
    if (typeof(self.weatherUndergound) !== 'undefined') {
        
        condition = self.weatherUndergound.get('metrics:conditiongroup');
        if (condition === 'poor'
            || condition === 'snow') {
            console.log('[Rain] Detected rain from WeatherUnderground condition');
            sources.push(self.weatherUndergound.id);
            rain = true;
        } else if (typeof(self.config.popThreshold) !== 'undefined'
            && self.weatherUndergound.get('metrics:pop') >= self.config.popThreshold) {
            console.log('[Rain] Detected rain from WeatherUnderground pop');
            rain = true;
            sources.push(self.weatherUndergound.id);
        }
    }
    
    // Handle ForecastIO Module
    if (typeof(self.forecastIO) !== 'undefined') {
        condition = self.forecastIO.get('metrics:conditiongroup');
        if (self.forecastIO.get('metrics:percipintensity') > 0
            || condition === 'poor'
            || condition === 'snow') {
            console.log('[Rain] Detected rain from ForecastIO condition');
            rain = true;
            sources.push(self.forecastIO.id);
        } else if (typeof(self.config.popThreshold) !== 'undefined'
            && self.forecastIO.get('metrics:pop') >= self.config.popThreshold) {
            console.log('[Rain] Detected rain from ForecastIO pop');
            rain = true;
            sources.push(self.forecastIO.id);
        }
    }
    
    // Handle OpenWeather Module
    if (typeof(self.weatherOpen) !== 'undefined') {
        condition = self.weatherOpen.get('metrics:zwaveOpenWeather');
        // see http://openweathermap.org/weather-conditions
        if (_.contains([
                200, 201, 202, 210, 211, 212, 221, 230, 231, 232,
                300, 301, 302, 310, 311, 312, 313, 314, 321,
                500, 501, 502, 503, 504, 511, 520, 521, 522, 531,
                600, 601, 602, 611, 612, 615, 616, 620, 621, 622,
                771,
                901, 902, 906, 960, 961, 962
            ],condition.weather[0].id)) {
            console.log('[Rain] Detected rain from OpenWeather');
            rain = true;
            sources.push(self.weatherOpen.id);
        }
    }
    
    if (rain) {
        self.vDev.set('metrics:icon','/ZAutomation/api/v1/load/modulemedia/Rain/icon.png');
        self.vDev.set('metrics:level','on');
        self.vDev.set('metrics:rain','on');
    } else {
        self.vDev.set('metrics:rain','off');
        console.log('[Rain] No rain detected');
    }
    self.vDev.set('metrics:sources',sources);
    
    // Reset timeout on new rain
    if (rain
        && hasTimeout) {
        console.log('[Rain] Detected rain start during timeout');
        clearTimeout(self.timeout);
        self.timeout = undefined;
        hasTimeout = false;
    // New rain
    } else if (rain
        && level === 'off') {
        console.log('[Rain] Detected rain start');
        self.vDev.set('metrics:change',Math.floor(new Date().getTime() / 1000));
        self.controller.emit("rain.start");
        var openWindows = [];
        _.each(self.config.windows,function(deviceId) {
            var deviceObject = self.controller.devices.get(deviceId);
            if (deviceObject === null) {
                console.error('[Rain] Could not find window sensor device');
            } else if (deviceObject.get('metrics:level') === 'on') {
                var location    = deviceObject.get('location');
                var room        = _.find(
                    self.controller.locations, 
                    function(item){ return (item.id === location) }
                );
                
                var message     = deviceObject.get('metrics:title');
                if (typeof(room) === 'object') {
                    message = message + ' (' + room.title + ')';
                }
                
                console.log('[Rain] msg'+message);
                openWindows.push(message);
            }
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
            && parseInt(self.config.timeout) > 0) {
            console.log('[Rain] Detected rain end. Start timeout');
            self.vDev.set('metrics:icon','/ZAutomation/api/v1/load/modulemedia/Rain/icon_timeout.png');
            self.timeout = setTimeout(
                _.bind(self.resetRain,self),
                (parseInt(self.config.timeout) * 1000 * 60)
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
    console.log('[Rain] Untrigger rain sensor');
    self.vDev.set('metrics:change',Math.floor(new Date().getTime() / 1000));
    self.vDev.set('metrics:level','off');
    self.vDev.set('metrics:icon','/ZAutomation/api/v1/load/modulemedia/Rain/icon_norain.png');
    self.vDev.set('metrics:sources',[]);
    
    self.controller.emit("rain.stop");
};
