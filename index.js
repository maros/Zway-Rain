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
    
    this.popThreshold = config.popThreshold;
    
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
    
    // TODO add listeners to binary devices
    // TODO find weather device 
    // TODO add listeners to binary devices
    checkRain();
};

Rain.prototype.stop = function () {
    var self = this;
    
    if (self.vDev) {
        self.controller.devices.remove(self.vDev.id);
        self.vDev = null;
    }
    
    Rain.super_.prototype.stop.call(this);
};

// ----------------------------------------------------------------------------
// --- Module methods
// ----------------------------------------------------------------------------

Rain.prototype.checkRain = function() {
    var self = this;
};


 