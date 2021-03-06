/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

var App = require('app');

var view;
describe('App.ConfigWidgetView', function () {

  beforeEach(function () {
    view = App.ConfigWidgetView.create({
      initPopover: Em.K,
      config: Em.Object.create({
        isOriginalSCP: false,
        isPropertyOverridable: false,
        cantBeUndone: false,
        isNotDefaultValue: false
      })
    });
  });

  describe('#undoAllowed', function () {

    Em.A([
      {
        cfg: {
          cantBeUndone: false,
          isNotDefaultValue: false
        },
        e: false
      },
      {
        cfg: {
          cantBeUndone: true,
          isNotDefaultValue: false
        },
        e: false
      },
      {
        cfg: {
          cantBeUndone: false,
          isNotDefaultValue: true
        },
        e: true
      },
      {
        cfg: {
          cantBeUndone: true,
          isNotDefaultValue: true
        },
        e: false
      }
    ]).forEach(function (test, index) {
        it('test #' + index, function () {
          view.get('config').setProperties(test.cfg);
          expect(view.get('undoAllowed')).to.equal(test.e);
        });
      });

  });

  describe('#overrideAllowed', function () {

    Em.A([
        {
          cfg: {
            isOriginalSCP: false,
            isPropertyOverridable: false,
            isComparison: false
          },
          e: false
        },
        {
          cfg: {
            isOriginalSCP: true,
            isPropertyOverridable: false,
            isComparison: false
          },
          e: false
        },
        {
          cfg: {
            isOriginalSCP: false,
            isPropertyOverridable: true,
            isComparison: false
          },
          e: false
        },
        {
          cfg: {
            isOriginalSCP: true,
            isPropertyOverridable: true,
            isComparison: false
          },
          e: true
        },
        {
          cfg: {
            isOriginalSCP: false,
            isPropertyOverridable: false,
            isComparison: true
          },
          e: false
        },
        {
          cfg: {
            isOriginalSCP: true,
            isPropertyOverridable: false,
            isComparison: true
          },
          e: false
        },
        {
          cfg: {
            isOriginalSCP: false,
            isPropertyOverridable: true,
            isComparison: true
          },
          e: false
        },
        {
          cfg: {
            isOriginalSCP: true,
            isPropertyOverridable: true,
            isComparison: true
          },
          e: false
        }
      ]).forEach(function (test, index) {
        it('test #' + index, function () {
          view.get('config').setProperties(test.cfg);
          expect(view.get('overrideAllowed')).to.equal(test.e);
        });
      });

  });

});
