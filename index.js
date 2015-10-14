/*** Rain Z-Way HA module *******************************************

Version: 1.0.0
(c) Maroš Kollár, 2015
-----------------------------------------------------------------------------
Author: maros@k-1.com <maros@k-1.com>
Description:
    This module checks weather condition and optinal binary sensors to
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
    
    self.weatherForecast = null;
    self.weatherCurrent = null;
    self.popThreshold = config.popThreshold;
    self.callback = _.bind(self.checkRain,self);

    // Create vdev
    this.vDev = this.controller.devices.create({
        deviceId: "Rain_" + this.id,
        defaults: {
            metrics: {
                level: 'off'
            }
        },
        overlay: {
            deviceType: 'sensorBinary',
            probeTitle: 'rain'
        },
        moduleId: this.id
    });
    
    setTimeout(_.bind(self.initCallback,self),5000);
};

Rain.prototype.initCallback = function() {
    var self = this;
    
    _.each(self.config.devices,function(deviceId) {
        self.controller.devices.on(deviceId,"change:metrics:level",self.callback);
    });

    self.controller.devices.each(function(vDev) {
        if (vDev.get('deviceType') === 'sensorMultilevel') {
            var scaleTitle = vDev.get('metrics:scaleTitle');
            if (scaleTitle === 'weather_current') {
                self.weatherCurrent = vDev;
                vDev.on('change:metrics:change',self.callback);
            } else if (scaleTitle === 'weather_forecast') {
                self.weatherForecast = vDev;
                vDev.on('change:metrics:change',self.callback);
            }
        }
    });

    self.checkRain();
};

Rain.prototype.stop = function () {
    var self = this;
    
    if (self.vDev) {
        self.controller.devices.remove(self.vDev.id);
        self.vDev = null;
    }

    if (typeof(self.weatherCurrent) !== 'null') {
        self.weatherCurrent.off('change:metrics:change',self.callback);
    }
    if (typeof(self.weatherForecast) !== 'null') {
        self.weatherForecast.off('change:metrics:change',self.callback);
    }

    _.each(self.config.devices,function(deviceId) {
        self.controller.devices.off(deviceId,"change:metrics:level",self.callback);
    });

    self.callback = null;
    
    Rain.super_.prototype.stop.call(this);
};

// ----------------------------------------------------------------------------
// --- Module methods
// ----------------------------------------------------------------------------

Rain.prototype.checkRain = function() {
    var self = this;
    
    var rain = false;
    var level = self.vDev.get('metrics:level');

     _.each(self.config.devices,function(deviceId) {
        var device = self.controller.devices.get(deviceId);
        if (device.get('metrics:level') === 'on') {
            rain = true;
        }
    });

    if (rain === false
        && typeof(self.weatherCurrent) !== 'null') {
        // TODO check weather forecast and condition
    }

    if (rain === true
        && level === 'off') {
        self.controller.emit("rain.start");
    }

    var newLevel = (rain ? 'on':'off');
    if (level != newLevel) {
        self.vDev.set('metrics:level',newLevel);
        self.vDev.set('metrics:icon','/ZAutomation/api/v1/load/modulemedia/Rain/icon'+(rain ? '':'_norain')+".png");
    }
};


 
