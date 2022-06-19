var Crunchy = (function() {
    // utility functions
    function isfn(fn){return typeof fn === 'function';}
    var async = (this.queueMicrotask || this.setTimeout).bind(this);

    // promise constructor
    function Crunchy(resolver) {
        if (!isfn(resolver)) throw TypeError();
        this.state = 1; var p1; p1 = this;
        this.adopters = [];
        this.notifiers = [];
        var reject = function(rx){final(p1, rx, 1);};
        resolver(function(vx){resolve(p1, vx);}, function(rx){reject(rx);});
    }
    var queue = [];
    Crunchy.prototype.then = function(oful, orej) {
        var rs, rj;
        var p2 = new Crunchy(function(rs_, rj_){rs = rs_; rj = rj_;});
        queue.push({p1: this, fns: [oful, orej, rs, rj]});
        if (this.state !== 1) executeQueue();
        return p2;
    };
    /**
     * @param {Crunchy} p1
     * @param {*} vx
     */
    function resolve(p1, vx) {
        var accept = function(vx){final(p1, vx, 0);};
        var reject = function(rx){final(p1, rx, 1);};
        if (p1.state !== 1) return;
        if (vx === null) return accept(vx);
        if (p1 === vx) return reject(new TypeError());
        if (vx instanceof Crunchy) {
            if (vx.state === 2) return accept(vx.value);
            if (vx.state === 3) return reject(vx.reason);
            vx.adopters.push(p1);
            return;
        }
        if (typeof vx !== 'object' && !isfn(vx)) return accept(vx);
        var then, done = false;
        try { then = vx.then;
            if (!isfn(then)) return accept(vx);
            then.call(vx, function(vx){
                if (done) return; done = true; resolve(p1, vx);
            }, function(rx) {
                if (done) return; done = true; reject(rx);
            }); return;
        } catch (ex) {if (done) return; return reject(ex);}
    }
    var sel1 = ['value', 'reason']; // selector
    /**
     * @param {Crunchy} p1 
     * @param {*} vx 
     * @param {number} offs 
     */
    function final(p1, vx, offs) {
        if (p1.state !== 1) return;
        p1[sel1[offs]] = vx;
        p1.state = 2 + offs;
        resolveDependents(p1, vx, offs);
        executeQueue();
    }
    /**
     * @param {Crunchy} p1 
     * @param {*} vx 
     * @param {number} offs 
     */
    function resolveDependents(p1, vx, offs) {
        /** @param {Crunchy} p2 */
        var fn = function(p2) {
            final(p2, vx, offs);
            resolveDependents(p2, vx, offs);
        };
        p1.adopters.forEach(fn);
        p1.notifiers.forEach(function(ob){ob.notify(p1);});
        p1.adopters.splice(0);
        p1.notifiers.splice(0);
    }
    var queueIsRunning = false;
    var stid;
    function executeQueue() {
        clearTimeout(stid);
        stid = async(function() { var on, rs, rj, rx, vx, ob, suc;
            queueIsRunning = true;
            for (var ix = 0; ix < queue.length; ix++) {
                ob = queue[ix];
                if (ob.p1.state === 1) continue;
                on = ob.fns[ob.p1.state - 2];
                rj = ob.fns[3];
                rs = ob.fns[2];
                rx = ob.fns[ob.p1.state];
                vx = ob.p1[sel1[ob.p1.state - 2]];
                if (isfn(on)) try {
                    rs(on(vx));
                } catch(ex) {
                    rj(ex);
                } else rx(vx);
                queue.splice(ix--, 1);
            } queueIsRunning = false;
        });
    }

    Crunchy.prototype.catch = function(orej) {return this.then(void(0), orej);};
    function on(ofin){return function(vx){ofin(); return vx;};}
    Crunchy.prototype.finally = function(ofin) {return this.then(on(ofin), on(ofin));};

    // static methods
    /** @returns {Crunchy} */
    Crunchy.resolve = function(value) {return new Crunchy(function(rs){rs(value);});};
    function isit(it){return typeof it === 'object' && isFinite(it.length) && typeof it.length === 'number';}
    var nonIterable = "Parameter is not iterable";
    /** @param {Crunchy} p1 */
    function AllNotifier(p1) {
        if (p1.state === 3) return final(this.promise, p1.reason, 1);
        var ob = this;
        this.values[this.index] = p1.value;
        this.resolved.count++;
        if (this.resolved.count === this.expected) {
            if (queueIsRunning) {
                final(ob.promise, ob.values, 0);
            } else async(function(){
                final(ob.promise, ob.values, 0);
            });
        }
    }
    Crunchy.all = function(iterable) {
        var rs, rj, values=[];
        var p2 = new Crunchy(function(rs_, rj_){rs = rs_; rj = rj_;});
        if (!isit(iterable)) throw TypeError(nonIterable);
        if (+iterable.length === 0) return Crunchy.resolve(iterable);
        var p1, resolved = {count: 0};
        for (var ix = 0; ix < +iterable.length; ix++) { // jshint -W083
            p1 = Crunchy.resolve(iterable[ix]);
            if (p1.state === 1) {
                p1.notifiers.push({
                    promise: p2,
                    values: values,
                    index: ix,
                    expected: +iterable.length,
                    resolved: resolved,
                    notify: AllNotifier
                });
            } else if (p1.state === 2) {
                values[ix] = p1.value;
                resolved.count++;
                if (resolved.count === +iterable.length) async(function(){rs(values);});
            } else if (p1.state === 3) {
                rj(p1.reason);
                break;
            }
        } return p2;
    };
    var sel2 = ["fulfilled", "rejected"];
    /** @param {Crunchy} p1 */
    function AllSettledNotifier(p1) {
        var ob = this;
        this.values[this.index] = {status: sel2[p1.state - 2]};
        var selector = sel1[p1.state - 2];
        this.values[this.index][selector] = p1[selector];
        this.resolved.count++;
        if (this.resolved.count === this.expected) {
            if (queueIsRunning) {
                final(ob.promise, ob.values, p1.state - 2);
            } else async(function(){
                final(ob.promise, ob.values, p1.state - 2);
            });
        }
    }
    function noop(){}
    Crunchy.allSettled = function(iterable) {
        var values=[], p2 = new Crunchy(noop);
        if (!isit(iterable)) throw TypeError(nonIterable);
        if (+iterable.length === 0) return Crunchy.resolve(iterable);
        var p1, resolved = {count: 0};
        for (var ix = 0; ix < iterable.length; ix++) { // jshint -W083
            p1 = Crunchy.resolve(iterable[ix]);
            if (p1.state === 1) {
                p1.notifiers.push({
                    promise: p2,
                    values: values,
                    index: ix,
                    expected: +iterable.length,
                    resolved: resolved,
                    notify: AllSettledNotifier
                });
                continue;
            }
            values[ix] = {status: sel2[p1.state - 2]};
            values[ix][sel1[p1.state - 2]] = p1[sel1[p1.state - 2]];
            resolved.count++;
            if (resolved.count === +iterable.length) async(function() {final(p2, values, 0);});
        } return p2;
    };
    Crunchy.reject = function(rx) {return new Crunchy(function(_rs, rj){rj(rx);});};
    Crunchy.any = function(iterable) {
        var rs, rj, p2 = new Crunchy(function(rs_, rj_){rs = rs_; rj = rj_;});
        if (!isit(iterable)) throw TypeError(nonIterable);
        var AggregateError = new Error("All promises were rejected");
        if (+iterable.length === 0) return Crunchy.reject(AggregateError);
        var rcnt = 0;
        for (var ix = 0; ix < +iterable.length; ix++) { // jshint -W083
            Crunchy.resolve(iterable[ix]).then(
                function(vx){rs(vx); rs=noop; rj=noop;},
                function(){if (++rcnt === +iterable.length) rj(AggregateError);}
            );
        } return p2;
    };
    /** @param {Crunchy} p1 */
    function RaceNotifier(p1) {
        if (this.promise.state !== 1) return;
        var ob = this;
        if (queueIsRunning) {
            final(ob.promise, p1[sel1[p1.state - 2]], p1.state - 2);
        } else async(function(){
            final(ob.promise, p1[sel1[p1.state - 2]], p1.state - 2);
        });
    }
    Crunchy.race = function(iterable) {
        var p2 = new Crunchy(noop);
        if (!isit(iterable)) throw TypeError(nonIterable);
        var p1;
        for (var ix = 0; ix < iterable.length; ix++) { // jshint -W083
            p1 = Crunchy.resolve(iterable[ix]);
            if (p1.state === 1) {
                p1.notifiers.push({
                    promise: p2,
                    notify: RaceNotifier
                });
                continue;
            }
            async(function() {
                final(p2, p1[sel1[p1.state - 2]], p1.state - 2);
            });
            break;
        } return p2;
    };
    return Crunchy;
})();
if (typeof module === 'object') module.exports = Crunchy;