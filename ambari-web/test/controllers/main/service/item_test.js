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

App = require('app');
require('ember');
require('models/host_component');
require('views/common/modal_popup');
require('mixins/common/userPref');
require('controllers/application');
require('controllers/global/background_operations_controller');
require('controllers/global/cluster_controller');
require('controllers/main/service/reassign_controller');
require('controllers/main/service/item');
var batchUtils = require('utils/batch_scheduled_requests');
var componentsUtils = require('utils/components');

describe('App.MainServiceItemController', function () {

  describe('#setStartStopState', function () {
    var tests = [
      {
        serviceController: {
          serviceName: "YARN"
        },
        backgroundOperationsController: {
          services: [
            {
              isRunning: true,
              dependentService: "ALL_SERVICES"
            }
          ]
        },
        isPending: true,
        m: 'operaion is active because all services are running'
      },
      {
        serviceController: {
          serviceName: "HBASE"
        },
        backgroundOperationsController: {
          services: [
            {
              isRunning: true,
              dependentService: "HBASE"
            }
          ]
        },
        isPending: true,
        m: 'operaion is active button because current service is running'
      },
      {
        serviceController: {
          serviceName: "HDFS"
        },
        backgroundOperationsController: {
          services: [

          ]
        },
        isPending: true,
        m: 'pending is true - backgroundOperationsController.services is empty'
      },
      {
        serviceController: {
          serviceName: "HBASE"
        },
        backgroundOperationsController: {
          services: [
            {
              isRunning: false,
              dependentService: "ALL_SERVICES"
            }
          ]
        },
        isPending: false,
        m: 'pending is false - operation is not running'
      },
      {
        serviceController: {
          serviceName: "HBASE"
        },
        backgroundOperationsController: {
          services: [
            {
              isRunning: true,
              dependentService: "HDFS"
            }
          ]
        },
        isPending: false,
        m: 'pending is false - current service is not running'
      }
    ];

    tests.forEach(function (test) {
      it(test.m, function () {
        sinon.stub(App.router, 'get', function(k) {
          if ('backgroundOperationsController.services' === k) return test.backgroundOperationsController.services;
          return Em.get(App.router, k);
        });
        var mainServiceItemController = App.MainServiceItemController.create({content: {serviceName: test.serviceController.serviceName}});
        mainServiceItemController.setStartStopState();
        App.router.get.restore();
        expect(mainServiceItemController.get('isPending')).to.equal(test.isPending);
      });
    })
  });

  describe('#reassignMaster()', function () {
    var tests = [
      {
        host_components: [
          {componentName: "RESOURCEMANGER"}
        ],
        componentName: "RESOURCEMANGER",
        result: true,
        m: 'run reassignMaster'
      },
      {
        host_components: [
          {componentName: "RESOURCEMANGER"}
        ],
        componentName: "DATANODE",
        result: false,
        m: 'don\t run reassignMaster'
      }
    ];

    tests.forEach(function (test) {
      var reassignMasterController = App.ReassignMasterController.create({currentStep: ''});

      beforeEach(function () {
        sinon.stub(reassignMasterController, 'saveComponentToReassign', Em.K);
        sinon.stub(reassignMasterController, 'getSecurityStatus', Em.K);
        sinon.stub(reassignMasterController, 'setCurrentStep', Em.K);
      });

      afterEach(function () {
        reassignMasterController.saveComponentToReassign.restore();
        reassignMasterController.getSecurityStatus.restore();
        reassignMasterController.setCurrentStep.restore();
      });

      it(test.m, function () {
        sinon.stub(App.router, 'transitionTo', Em.K);
        var mainServiceItemController = App.MainServiceItemController.create({});
        sinon.stub(App.HostComponent, 'find', function() {
          return test.host_components
        });
        sinon.stub(App.router, 'get', function(k) {
          if ('reassignMasterController' === k) return reassignMasterController;
          return Em.get(App.router, k);
        });
        mainServiceItemController.reassignMaster(test.componentName);
        expect(reassignMasterController.saveComponentToReassign.calledOnce).to.equal(test.result);
        expect(reassignMasterController.getSecurityStatus.calledOnce).to.equal(test.result);
        expect(reassignMasterController.setCurrentStep.calledOnce).to.equal(test.result);
        App.HostComponent.find.restore();
        App.router.transitionTo.restore();
        App.router.get.restore();
      });
    }, this);
  });

  describe("#doAction", function () {

    var el = document.createElement("BUTTON");
    el.disabled = false;
    var tests = [
      {
        event: {
          target: el,
          context: {
            action: 'runSmokeTest'
          }
        },
        m: "run runSmokeTest"
      },
      {
        event: {
          target: el,
          context: {
            action: 'refreshConfigs'
          }
        },
        m: "run refreshConfigs"
      },
      {
        event: {
          target: el,
          context: {
            action: 'restartAllHostComponents'
          }
        },
        m: "run restartAllHostComponents"
      },
      {
        event: {
          target: el,
          context: {
            action: 'rollingRestart'
          }
        },
        m: "run rollingRestart"
      }
    ];

    tests.forEach(function (test) {
      var mainServiceItemController = App.MainServiceItemController.create({});
      mainServiceItemController.set(test.event.context.action, Em.K);
      beforeEach(function () {
        sinon.spy(mainServiceItemController, test.event.context.action);
      });
      afterEach(function () {
        mainServiceItemController[test.event.context.action].restore();
      });
      it(test.m, function () {
        mainServiceItemController.doAction(test.event);
        expect(mainServiceItemController[test.event.context.action].calledOnce).to.equal(!test.event.target.disabled);
      });
    });
  });

  describe("#startStopPopupPrimary", function () {


    var tests = [
      {
        data: {
          "serviceName": "HDFS",
          "state": "STARTED",
          "query": Em.Object.create({ServiceInfo: "FAIL"})
        },
        request: {
          "RequestInfo": {
            "context": "_PARSE_.START.HDFS"
          },
          "Body": {
            "ServiceInfo": {
              "state": "STARTED"
            }
          }
        },
        m: "Start HDFS"
      },
      {
        data: {
          "serviceName": "YARN",
          "state": "STOPPED",
          "query": Em.Object.create({ServiceInfo: "FAIL"})
        },
        request: {
          "RequestInfo": {
            "context": "_PARSE_.STOP.YARN"
          },
          "Body": {
            "ServiceInfo": {
              "state": "STOPPED"
            }
          }
        },
        m: "Stop YARN"
      }
    ];

    beforeEach(function () {
      sinon.spy($, 'ajax');
    });

    afterEach(function () {
      $.ajax.restore();
    });


    tests.forEach(function (test) {
      it('', function () {
        var mainServiceItemController = App.MainServiceItemController.create({content: {serviceName: test.data.serviceName}});
        mainServiceItemController.startStopPopupPrimary(test.data.state, test.data.query);
        expect($.ajax.calledOnce).to.equal(true);

        expect(JSON.parse($.ajax.args[0][0].data).Body.ServiceInfo.state).to.equal(test.request.Body.ServiceInfo.state);
        expect(JSON.parse($.ajax.args[0][0].data).RequestInfo.context).to.equal(test.request.RequestInfo.context);

        expect(mainServiceItemController.get('isStopDisabled')).to.equal(true);
        expect(mainServiceItemController.get('isStartDisabled')).to.equal(true);
      });
    });


  });

  describe("#startService , #stopService", function () {
    var mainServiceItemController = App.MainServiceItemController.create({startStopPopup: Em.K});
    beforeEach(function () {
      sinon.spy(mainServiceItemController, "startStopPopup");
    });
    afterEach(function () {
      mainServiceItemController.startStopPopup.restore();
    });
    it("start service", function () {
      mainServiceItemController.startService({});
      expect(mainServiceItemController.startStopPopup.calledWith({},App.HostComponentStatus.started)).to.equal(true);
    });
    it("stop service", function () {
      mainServiceItemController.stopService({});
      expect(mainServiceItemController.startStopPopup.calledWith({},App.HostComponentStatus.stopped)).to.equal(true);
    });
  });


  describe("#turnOnOffPassive", function () {
    var mainServiceItemController = App.MainServiceItemController.create({turnOnOffPassiveRequest: Em.K});
    beforeEach(function () {
      sinon.spy(batchUtils, "turnOnOffPassiveRequest");
      mainServiceItemController.set('content', {serviceName: ''});
    });
    afterEach(function () {
      batchUtils.turnOnOffPassiveRequest.restore();
    });
    it("turns on/off passive mode for service", function () {
      mainServiceItemController.turnOnOffPassive({}).onPrimary();
      expect(batchUtils.turnOnOffPassiveRequest.calledOnce).to.equal(true);
    });
  });

  describe("#runSmokeTest", function () {
    var tests = [
      {
        content: {
          id: "YARN",
          service_name: "YARN",
          work_status: "STARTED"
        },
        startSmoke: true,
        serviceName: "MAPREDUCE2",
        m: "don't run smoke test primary for MAPREDUCE2"
      },
      {
        content: {
          id: "YARN",
          service_name: "YARN",
          work_status: "STOPPED"
        },
        startSmoke: false,
        serviceName: "MAPREDUCE2",
        m: "run smoke test primary for MAPREDUCE2"
      },
      {
        m: "run smoke test primary for all services (not MAPREDUCE2)",
        startSmoke: true,
        default: true
      }
    ];

    tests.forEach(function (test) {
      var mainServiceItemController = test.default ? App.MainServiceItemController.create({runSmokeTestPrimary: Em.K}) :
        App.MainServiceItemController.create({content: {serviceName: test.serviceName}, runSmokeTestPrimary: Em.K});
      beforeEach(function () {
        sinon.spy(mainServiceItemController, "runSmokeTestPrimary");
      });
      afterEach(function () {
        mainServiceItemController.runSmokeTestPrimary.restore();
      });
      it(test.m, function () {
        if (!test.default) {
          App.store.load(App.Service, test.content);
        }
        mainServiceItemController.runSmokeTest({}).onPrimary();
        expect(mainServiceItemController.runSmokeTestPrimary.calledOnce).to.equal(test.startSmoke);
      });
    });
  });

  describe("#startStopPopup", function () {
    var el = document.createElement("BUTTON");
    el.disabled = false;
    var event = {
      target: el
    };
    var mainServiceItemController = App.MainServiceItemController.create({content: {serviceName: "HDFS"}});
    beforeEach(function () {
      sinon.spy(mainServiceItemController, "startStopPopupPrimary");
      sinon.spy(Em.I18n, "t");
    });
    afterEach(function () {
      mainServiceItemController.startStopPopupPrimary.restore();
      Em.I18n.t.restore();
    });
    it("start start/stop service popup", function () {
      mainServiceItemController.startStopPopup(event, "").onPrimary();
      expect(mainServiceItemController.startStopPopupPrimary.calledOnce).to.equal(true);
    });

    describe("modal messages", function() {
      it ("should confirm stop if serviceHealth is INSTALLED", function() {
        mainServiceItemController.startStopPopup(event, "INSTALLED");
        expect(Em.I18n.t.calledWith('services.service.stop.confirmMsg')).to.be.ok;
        expect(Em.I18n.t.calledWith('services.service.stop.confirmButton')).to.be.ok;
      });

      it ("should confirm start if serviceHealth is not INSTALLED", function() {
        mainServiceItemController.startStopPopup(event, "");
        expect(Em.I18n.t.calledWith('services.service.start.confirmMsg')).to.be.ok;
        expect(Em.I18n.t.calledWith('services.service.start.confirmButton')).to.be.ok;
      });
    });
  });

  describe("#restartAllHostComponents", function () {
    var temp = batchUtils.restartAllServiceHostComponents;
    beforeEach(function () {
      batchUtils.restartAllServiceHostComponents = Em.K;
      sinon.spy(batchUtils, "restartAllServiceHostComponents");
      sinon.stub(App.Service, 'find', function() {
        return Em.Object.create({serviceTypes: []});
      });
    });
    afterEach(function () {
      batchUtils.restartAllServiceHostComponents.restore();
      batchUtils.restartAllServiceHostComponents = temp;
      App.Service.find.restore();
    });

    var mainServiceItemController = App.MainServiceItemController.create({content: {displayName: "HDFS"}});

    it("start restartAllHostComponents for service", function () {
      mainServiceItemController.restartAllHostComponents({}).onPrimary();
      expect(batchUtils.restartAllServiceHostComponents.calledOnce).to.equal(true);
    });
  });

  describe("#rollingRestart", function () {
    var temp = batchUtils.launchHostComponentRollingRestart;
    beforeEach(function () {
      batchUtils.launchHostComponentRollingRestart = Em.K;
      sinon.spy(batchUtils, "launchHostComponentRollingRestart");
    });
    afterEach(function () {
      batchUtils.launchHostComponentRollingRestart.restore();
      batchUtils.launchHostComponentRollingRestart = temp;
    });

    var mainServiceItemController = App.MainServiceItemController.create();

    it("start restartAllHostComponents for service", function () {
      mainServiceItemController.rollingRestart();
      expect(batchUtils.launchHostComponentRollingRestart.calledOnce).to.equal(true);
    });
  });

  describe("#isStartDisabled", function () {
    var tests = [
      {
        content: {
          healthStatus: 'red'
        },
        isPending: true,
        disabled: true,
        m: "disabled because of pending"
      },
      {
        content: {
          healthStatus: 'green'
        },
        isPending: false,
        disabled: true,
        m: "disabled because healthStatus is not red"
      },
      {
        content: {
          healthStatus: 'red'
        },
        isPending: false,
        disabled: false,
        m: "enabled because healthStatus is red and pending is false"
      }
    ];
    tests.forEach(function (test) {
      it(test.m, function () {
        var mainServiceItemController = App.MainServiceItemController.create({content: {healthStatus: test.content.healthStatus}, isPending: test.isPending});
        expect(mainServiceItemController.get('isStartDisabled')).to.equal(test.disabled);
      });
    });
  });

  describe("#isSopDisabled", function () {
    var tests = [
      {
        content: {
          healthStatus: 'red'
        },
        isPending: true,
        disabled: true,
        m: "disabled because of pending"
      },
      {
        content: {
          healthStatus: 'green'
        },
        isPending: false,
        disabled: false,
        m: "enabled because healthStatus is green and pending is false"
      },
      {
        content: {
          healthStatus: 'red'
        },
        isPending: false,
        disabled: true,
        m: "disabled because healthStatus is not green"
      }
    ];
    tests.forEach(function (test) {
      it(test.m, function () {
        var mainServiceItemController = App.MainServiceItemController.create({content: test.content, isPending: test.isPending});
        expect(mainServiceItemController.get('isStopDisabled')).to.equal(test.disabled);
      });
    });
  });

  describe("#runRebalancer", function () {
    it("run rebalancer", function () {
      sinon.stub(App.router, 'get', function(k) {
        if ('applicationController' === k) {
          return Em.Object.create({
            dataLoading: function() {
              return {done: Em.K}
            }
          });
        }
        return Em.get(App.router, k);
      });
      var mainServiceItemController = App.MainServiceItemController.create({content: {runRebalancer: false}});
      mainServiceItemController.runRebalancer().onPrimary();
      expect(mainServiceItemController.get("content.runRebalancer")).to.equal(true);
      App.router.get.restore();
    });
  });

  describe("#runCompaction", function () {
    it("run compaction", function () {
      sinon.stub(App.router, 'get', function(k) {
        if ('applicationController' === k) {
          return Em.Object.create({
            dataLoading: function() {
              return {done: Em.K}
            }
          });
        }
        return Em.get(App.router, k);
      });
      var mainServiceItemController = App.MainServiceItemController.create({content: {runCompaction: false}});
      mainServiceItemController.runCompaction().onPrimary();
      expect(mainServiceItemController.get("content.runCompaction")).to.equal(true);
      App.router.get.restore();
    });
  });

  describe("#runSmokeTestPrimary", function () {
    beforeEach(function () {
      sinon.stub(App, 'get').withArgs('clusterName').returns('myCluster');
      sinon.spy($, 'ajax');
    });

    afterEach(function () {
      App.get.restore();
      $.ajax.restore();
    });

    var tests = [
      {
        data: {
          'serviceName': "HDFS",
          'displayName': "HDFS",
          'query': "test"
        },
        "RequestInfo": {
          "context": "HDFS Service Check",
          "command" : "HDFS_SERVICE_CHECK"
        },
        "Requests/resource_filters": [{"service_name" : "HDFS"}]
      },
      {
        data: {
          'serviceName': "KERBEROS",
          'displayName': "Kerberos",
          'query': "test"
        },
        "RequestInfo": {
          "context": "Kerberos Service Check",
          "command" : "KERBEROS_SERVICE_CHECK",
          "operation_level": {
            "level": "CLUSTER",
            "cluster_name": "myCluster"
          }
        },
        "Requests/resource_filters": [{"service_name" : "KERBEROS"}]
      }
    ];

    tests.forEach(function (test) {

      var mainServiceItemController = App.MainServiceItemController.create({content: {serviceName: test.data.serviceName,
        displayName: test.data.displayName}});
      beforeEach(function () {
        mainServiceItemController.set("runSmokeTestErrorCallBack", Em.K);
        mainServiceItemController.set("runSmokeTestSuccessCallBack", Em.K);
      });

      it('send request to run smoke test for ' + test.data.serviceName, function () {
        mainServiceItemController.runSmokeTestPrimary(test.data.query);
        expect($.ajax.calledOnce).to.equal(true);

        expect(JSON.parse($.ajax.args[0][0].data).RequestInfo.context).to.equal(test.RequestInfo.context);
        expect(JSON.parse($.ajax.args[0][0].data).RequestInfo.command).to.equal(test.RequestInfo.command);
        expect(JSON.parse($.ajax.args[0][0].data)["Requests/resource_filters"][0].serviceName).to.equal(test["Requests/resource_filters"][0].serviceName);
        expect(JSON.parse($.ajax.args[0][0].data).RequestInfo.operation_level).to.be.deep.equal(test.RequestInfo.operation_level);
      });
    });
  });


  describe('#downloadClientConfigs()', function () {

    var mainServiceItemController = App.MainServiceItemController.create({
      content: {
        clientComponents: [
          Em.Object.create({
            totalCount: 1,
            componentName: 'C1',
            displayName: 'd1'
          })
        ],
        serviceName: 'S1'
      }
    });

    beforeEach(function () {
      sinon.stub(componentsUtils, 'downloadClientConfigs', Em.K);
    });
    afterEach(function () {
      componentsUtils.downloadClientConfigs.restore();
    });

    it('should launch $.fileDownload method', function () {
      mainServiceItemController.downloadClientConfigs();
      expect(componentsUtils.downloadClientConfigs.calledWith({
        serviceName: 'S1',
        componentName: 'C1',
        displayName: 'd1'
      })).to.be.true;
    });
    it('should launch $.fileDownload method, event passed', function () {
      var event = {
        label: 'label1',
        name: 'name1'
      };
      mainServiceItemController.downloadClientConfigs(event);
      expect(componentsUtils.downloadClientConfigs.calledWith({
        serviceName: 'S1',
        componentName: 'name1',
        displayName: 'label1'
      })).to.be.true;
    });
  });

  describe('#startLdapKnox() and #stopLdapKnox() should call startStopLdapKnox once: ', function () {


    var mainServiceItemController = App.MainServiceItemController.create({content: {serviceName: 'KNOX',
      displayName: 'Knox'}});

    beforeEach(function () {
      sinon.stub(mainServiceItemController, 'startStopLdapKnox', function(){
        return true;
      });
    });
    afterEach(function () {
      mainServiceItemController.startStopLdapKnox.restore();
    });

    var tests = [
      {
        methodName: 'startLdapKnox',
        callback: mainServiceItemController.startLdapKnox
      },
      {
        methodName: 'stopLdapKnox',
        callback: mainServiceItemController.stopLdapKnox
      }
    ];

    tests.forEach(function(test){
      it(test.methodName + ' should call startStopLdapKnox method', function () {
        test.callback.call(mainServiceItemController);
        expect(mainServiceItemController.startStopLdapKnox.calledOnce).to.be.true;
      });
    },this);

  });

  describe("#executeCustomCommand", function () {
    var data = {
      data: {
        'serviceName': "SAMPLESRV",
        'displayName': "SAMPLESRV",
        'query': "test"
      },
      "RequestInfo": {
        "context": "Execute Custom Commands",
        "command" : "SAMPLESRVCUSTOMCOMMANDS"
      },
      "Requests/resource_filters": [{"service_name" : "SAMPLESRV"}]
    };

    var context = {
      label: 'Execute Custom Commands',
      service: data.data.serviceName,
      component: data.data.serviceName,
      command: data.RequestInfo.command
    };

    var mainServiceItemController = App.MainServiceItemController.create({
      content: {
        serviceName: data.data.serviceName,
        displayName: data.data.displayName
      }
    });

    before(function () {
      mainServiceItemController.set("executeCustomCommandErrorCallback", Em.K);
      mainServiceItemController.set("executeCustomCommandSuccessCallback", Em.K);
      sinon.spy(App, 'showConfirmationPopup');
    });

    after(function () {
      App.showConfirmationPopup.restore();
    });

    it('shows a confirmation popup', function () {
      mainServiceItemController.executeCustomCommand(context);
      expect(App.showConfirmationPopup.calledOnce).to.equal(true);
    });
  });
});
