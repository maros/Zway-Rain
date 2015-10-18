# Zway-Rain

This plugin creates a virtual binary rain sensor, that indicates whether it 
currently rains or not. The sensor can query 

* multiple binary sensors (eg. a FIB_FGBS-001 with an attached rain sensor)
* the standard OpenWeather plugin
* the WeatherUndergound plugin from https://github.com/maros/Zway-WeatherUnderground

# Configuration

## rainSensors

List of binary sensors to query.

## timeout

Keep the sensor in rain state n-minutes after last rain was detected. Will
un-trip immediately if left empty

## popThreshold

Current conditions from WeatherUndergound contain the current probability
of probability of precipitation. If this value is set, then pop values higer
than the threshold will trigger the rain state.

# Events

## rain.start

Will be called whenever rain starts.

# Virtual Devices

This module creates a virtual binarySensor device that indicates the current
rain state.

# License

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or any 
later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU General Public License for more details.
