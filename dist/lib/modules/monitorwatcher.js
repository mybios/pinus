"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const pomelo_logger_1 = require("pomelo-logger");
var logger = pomelo_logger_1.getLogger('pomelo', __filename);
const utils = require("../util/utils");
const events_1 = require("../util/events");
const Constants = require("../util/constants");
module.exports = function (opts, consoleService) {
    return new MonitorWatcherModule(opts, consoleService);
};
exports.moduleId = Constants.KEYWORDS.MONITOR_WATCHER;
class MonitorWatcherModule {
    constructor(opts, consoleService) {
        this.app = opts.app;
        this.service = consoleService;
        this.id = this.app.getServerId();
        this.app.event.on(events_1.default.START_SERVER, finishStart.bind(null, this));
    }
    ;
    start(cb) {
        subscribeRequest(this, this.service.agent, this.id, cb);
    }
    ;
    monitorHandler(agent, msg, cb) {
        if (!msg || !msg.action) {
            return;
        }
        var func = monitorMethods[msg.action];
        if (!func) {
            logger.info('monitorwatcher unknown action: %j', msg.action);
            return;
        }
        func(this, agent, msg, cb);
    }
    ;
}
exports.MonitorWatcherModule = MonitorWatcherModule;
// ----------------- monitor start method -------------------------
var subscribeRequest = function (self, agent, id, cb) {
    var msg = { action: 'subscribe', id: id };
    agent.request(Constants.KEYWORDS.MASTER_WATCHER, msg, function (err, servers) {
        if (err) {
            logger.error('subscribeRequest request to master with error: %j', err.stack);
            utils.invokeCallback(cb, err);
        }
        var res = [];
        for (var id in servers) {
            res.push(servers[id]);
        }
        addServers(self, res);
        utils.invokeCallback(cb);
    });
};
// ----------------- monitor request methods -------------------------
var addServer = function (self, agent, msg, cb) {
    logger.debug('[%s] receive addServer signal: %j', self.app.serverId, msg);
    if (!msg || !msg.server) {
        logger.warn('monitorwatcher addServer receive empty message: %j', msg);
        utils.invokeCallback(cb, Constants.SIGNAL.FAIL);
        return;
    }
    addServers(self, [msg.server]);
    utils.invokeCallback(cb, Constants.SIGNAL.OK);
};
var removeServer = function (self, agent, msg, cb) {
    logger.debug('%s receive removeServer signal: %j', self.app.serverId, msg);
    if (!msg || !msg.id) {
        logger.warn('monitorwatcher removeServer receive empty message: %j', msg);
        utils.invokeCallback(cb, Constants.SIGNAL.FAIL);
        return;
    }
    removeServers(self, [msg.id]);
    utils.invokeCallback(cb, Constants.SIGNAL.OK);
};
var replaceServer = function (self, agent, msg, cb) {
    logger.debug('%s receive replaceServer signal: %j', self.app.serverId, msg);
    if (!msg || !msg.servers) {
        logger.warn('monitorwatcher replaceServer receive empty message: %j', msg);
        utils.invokeCallback(cb, Constants.SIGNAL.FAIL);
        return;
    }
    replaceServers(self, msg.servers);
    utils.invokeCallback(cb, Constants.SIGNAL.OK);
};
var startOver = function (self, agent, msg, cb) {
    var fun = self.app.lifecycleCbs[Constants.LIFECYCLE.AFTER_STARTALL];
    if (!!fun) {
        fun.call(null, self.app);
    }
    self.app.event.emit(events_1.default.START_ALL);
    utils.invokeCallback(cb, Constants.SIGNAL.OK);
};
// ----------------- common methods -------------------------
var addServers = function (self, servers) {
    if (!servers || !servers.length) {
        return;
    }
    self.app.addServers(servers);
};
var removeServers = function (self, ids) {
    if (!ids || !ids.length) {
        return;
    }
    self.app.removeServers(ids);
};
var replaceServers = function (self, servers) {
    self.app.replaceServers(servers);
};
// ----------------- bind methods -------------------------
var finishStart = function (self, id) {
    var msg = { action: 'record', id: id };
    self.service.agent.notify(Constants.KEYWORDS.MASTER_WATCHER, msg);
};
var monitorMethods = {
    'addServer': addServer,
    'removeServer': removeServer,
    'replaceServer': replaceServer,
    'startOver': startOver
};
//# sourceMappingURL=monitorwatcher.js.map