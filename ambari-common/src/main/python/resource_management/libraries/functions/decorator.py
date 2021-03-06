#!/usr/bin/env python
"""
Licensed to the Apache Software Foundation (ASF) under one
or more contributor license agreements.  See the NOTICE file
distributed with this work for additional information
regarding copyright ownership.  The ASF licenses this file
to you under the Apache License, Version 2.0 (the
"License"); you may not use this file except in compliance
with the License.  You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

Ambari Agent

"""

import time
__all__ = ['retry', ]

from resource_management.core.logger import Logger


def retry(times=3, sleep_time=1, backoff_factor=1, err_class=Exception):
  """
  Retry decorator for improved robustness of functions.
  :param times: Number of times to attempt to call the function.
  :param sleep_time: Initial sleep time between attempts
  :param backoff_factor: After every failed attempt, multiple the previous sleep time by this factor.
  :param err_class: Exception class to handle
  :return: Returns the output of the wrapped function.
  """
  def decorator(function):
    def wrapper(*args, **kwargs):
      _times = times
      _sleep_time = sleep_time
      _backoff_factor = backoff_factor
      _err_class = err_class

      while _times > 1:
        _times -= 1
        _sleep_time *= _backoff_factor
        try:
          return function(*args, **kwargs)
        except _err_class, err:
          Logger.info("Will retry %d time(s), caught exception: %s. Sleeping for %d sec(s)" % (_times, str(err), _sleep_time))
          time.sleep(_sleep_time)

      return function(*args, **kwargs)
    return wrapper
  return decorator

