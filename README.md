# Zway-Rain

This module creates a virtual binary rain sensor, that indicates whether it 
currently rains or not. The sensor can query 

* multiple binary sensors (eg. a FIB_FGBS-001 with an attached rain sensor)
* the standard OpenWeather module
* the WeatherUndergound module from https://github.com/maros/Zway-WeatherUnderground
* the ForecastIO module from https://github.com/maros/Zway-ForecastIO

If one of the sources detects rain, then the rain sensor will be triggered.
Untriggering after rain stops may have an optional timeout period.

Optionally multiple binary sensors (ie. window sensors) may be configured
that should be checked if rain starts. A notification will be issued when
an open window is detected. The check will only happen once when rain starts
and will not be repeated during a rain period.

Please note that the rain data from OpenWeather, WeatherUndergound and
ForecastIO modules is not sufficiently accurate to operate in scenarios 
requiring accurate results, like management of window drives or awning blinds. 
Consider installing a physical sensor in these cases.

# Configuration

## rainSensors

List of binary sensors to query.

## timeout

Keep the sensor in rain state n-minutes after last rain was detected. Will
un-trip immediately if left empty

## popThreshold

Current conditions from WeatherUndergound and ForecastIO contain the current 
probability of probability of precipitation. If this value is set, then pop 
values higher than the threshold will trigger the rain state.

## windows

Window sensors to check when rain starts.

# Events

## rain.start

Will be called whenever rain starts.

# Events

## rain.start, rain.stop

Emits an event when rain start or stop is detected

## security.rain.alarm

Emits a security event (same structure as the SecurityZone module events)
when rain starts while an open window was detectet

# Virtual Devices

This module creates a virtual binarySensor device that indicates the current
rain state. Additionally the device stores the current rain status
regardless of timeouts in metrics:rain. ie. if rain is detected both 
metrics:level and metrics:rain are on. Once rain stops and the rain timeout
begins metrics:rain will be switched off. metrics:rain will remain on until
the timeout ends. In all cases a list of vDev IDs triggering the rain state
will be stored in metrics:sources.

# Installation

Install a weather module (such as ForecastIO, WeatherUnderground or 
OpenWeather first)

The prefered way of installing this module is via the "Zwave.me App Store"
available in 2.2.0 and higher. For stable module releases no access token is 
required. If you want to test the latest pre-releases use 'k1_beta' as 
app store access token.

For developers and users of older Zway versions installation via git is 
recommended.

```shell
cd /opt/z-way-server/automation/userModules
git clone https://github.com/maros/Zway-Rain.git Rain --branch latest
```

To update or install a specific version
```shell
cd /opt/z-way-server/automation/userModules/Rain
git fetch --tags
# For latest released version
git checkout tags/latest
# For a specific version
git checkout tags/1.02
# For development version
git checkout -b master --track origin/master
```

# License

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or any 
later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU General Public License for more details.
