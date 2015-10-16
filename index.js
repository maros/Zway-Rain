/*** Rain Z-Way HA module *******************************************

Version: 1.0.0
(c) Maroš Kollár, 2015
-----------------------------------------------------------------------------
Author: maros@k-1.com <maros@k-1.com>
Description:
    This module checks weather condition and optional binary sensors to
    detect rain

******************************************************************************/

function Rain (id, controller) {
    // Call superconstructor first (AutomationModule)
    Rain.super_.call(this, id, controller);
}

inherits(Rain, AutomationModule);

_module = Rain;

// ----------------------------------------------------------------------------
// --- Module instance initialized
// ----------------------------------------------------------------------------

Rain.prototype.init = function (config) {
    Rain.super_.prototype.init.call(this, config);

    var self = this;
    var langFile = self.controller.loadModuleLang("Rain");
    
    self.weatherUndergound = undefined;
    self.weatherOpen = undefined;
    self.timeout = undefined;
    self.popThreshold = config.popThreshold;
    self.callback = _.bind(self.checkRain,self);

    // Create vdev
    this.vDev = this.controller.devices.create({
        deviceId: "Rain_" + this.id,
        defaults: {
            metrics: {
                title: langFile.title,
                level: 'off',
                icon: '/ZAutomation/api/v1/load/modulemedia/Rain/icon_norain.png'
            }
        },
        overlay: {
            deviceType: 'sensorBinary',
            probeTitle: 'rain'
        },
        moduleId: this.id
    });
    
    setTimeout(_.bind(self.initCallback,self),60000);
};

Rain.prototype.initCallback = function() {
    var self = this;
    
    _.each(self.config.devices,function(deviceId) {
        self.controller.devices.on(deviceId,"change:metrics:level",self.callback);
    });

    self.controller.devices.each(function(vDev) {
        var deviceType = vDev.get('deviceType');
        if (deviceType === 'sensorMultilevel'
            && vDev.get('metrics:probeTitle') === 'weather_current') {
            self.weatherUndergound = vDev;
            vDev.on('change:metrics:change',self.callback);
        }
        if (deviceType === 'sensorMultiline'
            && vDev.get('metrics:multilineType') === 'openWeather') {
            self.weatherOpen = vDev;
            vDev.on('change:metrics:zwaveOpenWeather',self.callback);
        }
    });

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

    _.each(self.config.devices,function(deviceId) {
        self.controller.devices.off(deviceId,"change:metrics:level",self.callback);
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
    var hasTicmeout  = (typeof(self.timeout) !== 'undefined');

    _.each(self.config.devices,function(deviceId) {
        var device = self.controller.devices.get(deviceId);
        if (device.get('metrics:level') === 'on') {
            rain = true;
        }
    });

    // Handle WeatherUndergound Module
    if (! rain && typeof(self.weatherUndergound) !== 'undefined') {
        if (self.weatherUndergound.get('metrics:conditiongroup') === 'poor') {
            rain = true;
        } else if (typeof(self.config.popThreshold) !== 'undefined'
            && self.weatherUndergound.get('metrics:pop') >= self.config.popThreshold) {
            rain = true;
        }
    }
    
    // Handle OpenWeather Module
    if (! rain && typeof(self.weatherOpen) !== 'undefined') {
        var data = self.weatherOpen.get('metrics:zwaveOpenWeather');
        // see http://openweathermap.org/weather-conditions
        if (_.contains([
                200, 201, 202, 210, 211, 212, 221, 230, 231, 232,
                300, 301, 302, 310, 311, 312, 313, 314, 321,
                500, 501, 502, 503, 504, 511, 520, 521, 522, 531,
                600, 601, 602, 611, 612, 615, 616, 620, 621, 622,
                771,
                901, 902, 906, 960, 961, 962
            ],data.weather[0].id)) {
            rain = true;
        }
    }
    
    // Reset timeout on new rain
    if (rain
        && hasTicmeout) {
        clearTimeout(self.timeout);
        self.timeout = undefined;
        hasTicmeout = false;
    // New rain
    } else if (rain
        && level === 'off') {
        self.vDev.set('metrics:level','on');
        self.vDev.set('metrics:change',Math.floor(new Date().getTime() / 1000));
        self.vDev.set('metrics:icon','/ZAutomation/api/v1/load/modulemedia/Rain/icon.png');
        self.controller.emit("rain.start");
    // Stop rain
    } else if (! rain
        && level === 'on'
        && ! hasTicmeout) {
        
        // Timeout
        if (typeof(self.config.timeout) !== 'undefined'
            && parseInt(self.config.timeout) > 0) {
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

Rain.prototype.reseRain = function() {
    var self        = this;
    self.timeout    = undefined;
    self.vDev.set('metrics:level','off');
    self.vDev.set('metrics:change',Math.floor(new Date().getTime() / 1000));
    self.vDev.set('metrics:icon','/ZAutomation/api/v1/load/modulemedia/Rain/icon_norain.png');
};