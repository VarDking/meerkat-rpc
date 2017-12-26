'use strict';
const fs           = require('fs');
const Loader       = require('pomelo-loader');
const EventEmitter = require('events').EventEmitter;

const Dispatcher             = require('./dispatcher');
const defaultAcceptorFactory = require('./acceptor');

class Gateway extends EventEmitter {
    constructor(opts) {
        super();
        this.opts            = opts || {};
        this.port            = opts.port || 3050;
        this.started         = false;
        this.stoped          = false;
        this.acceptorFactory = opts.acceptorFactory || defaultAcceptorFactory;
        this.services        = opts.services;
        let dispatcher       = new Dispatcher(this.services);
        if (!!this.opts.reloadRemotes) {
            watchServices(this, dispatcher);
        }
        this.acceptor = this.acceptorFactory.create(opts, function (tracer, msg, cb) {
            dispatcher.route(tracer, msg, cb);
        });
    }
}

/**
 * create and init gateway
 *
 * @param opts {services: {rpcServices}, connector:conFactory(optional), router:routeFunction(optional)}
 */
Gateway.create = function (opts) {
    if (!opts || !opts.services) {
        throw new Error('opts and opts.services should not be empty.');
    }

    return new Gateway(opts);
};

const pro = Gateway.prototype;

pro.stop = function () {
    if (!this.started || this.stoped) {
        return;
    }
    this.stoped = true;
    try {
        this.acceptor.close();
    } catch (err) {
    }
};

pro.start = function () {
    if (this.started) {
        throw new Error('gateway already start.');
    }
    this.started = true;

    var self = this;
    this.acceptor.on('error', self.emit.bind(self, 'error'));
    this.acceptor.on('closed', self.emit.bind(self, 'closed'));
    this.acceptor.listen(this.port);
};

function watchServices(gateway, dispatcher) {
    var paths = gateway.opts.paths;
    var app   = gateway.opts.context;
    for (var i = 0; i < paths.length; i++) {
        (function (index) {
            fs.watch(paths[index].path, function (event, name) {
                if (event === 'change') {
                    var res  = {};
                    var item = paths[index];
                    var m    = Loader.load(item.path, app);
                    if (m) {
                        createNamespace(item.namespace, res);
                        for (var s in m) {
                            res[item.namespace][s] = m[s];
                        }
                    }
                    dispatcher.emit('reload', res);
                }
            });
        })(i);
    }
}

function createNamespace(namespace, proxies) {
    proxies[namespace] = proxies[namespace] || {};
}

export {Gateway};