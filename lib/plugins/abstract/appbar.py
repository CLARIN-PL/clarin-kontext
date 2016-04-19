# Copyright (c) 2014 Institute of the Czech National Corpus
#
# This program is free software; you can redistribute it and/or
# modify it under the terms of the GNU General Public License
# as published by the Free Software Foundation; version 2
# dated June, 1991.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.

"""
All the application_bar plug-in implementations should inherit from AbstractApplicationBar
"""


class AbstractApplicationBar(object):

    def get_fallback_content(self):
        """
        Returns an HTML content usable as a fallback replacement for the standard content
        """
        raise NotImplementedError()

    def get_styles(self, plugin_api):
        """
        Returns a list of dicts {'url': ...} defining external CSS requirements KonText
        must load.

        Returns an empty list if not overridden.

        arguments:
        plugin_api -- a controller.PluginApi instance
        """
        return []

    def get_scripts(self, plugin_api):
        """
        Returns a dict:
            'main': ... url of the main script ...,
            'deps': [ {'module': ... module name..., 'url': ... module url},...]

        Returns none if not overridden.

        arguments:
        plugin_api -- a controller.PluginApi instance
        """
        return None

    def get_contents(self, plugin_api, return_url):
        """
        Returns standard HTML content based on set language and user identification/settings stored in cookies.

        arguments:
        plugin_api -- a controller.PluginApi instance
        return_url -- a URL user returns to in case she uses some of he appbar's links/services
        """
        raise NotImplementedError()
