


/* LOW-LEVEL FAST CONS-CELLS STORE */

function Fastor() {

    this.db = {
        all: {},
        cons: {},
        car: {},
        cdr: {},
        conscar: {},
        conscdr: {},
        carcdr: {},
    }

    this.conscarcdr = {};

    this.dbId = 0;
}



Fastor.prototype.add = function (cons, car, cdr) {

    if (this.conscarcdr[strvb(cons, car, cdr)]) return;

    this.db.all[++this.dbId] = { cons, car, cdr };
    this.conscarcdr[strvb(cons, car, cdr)] = this.dbId;

    (this.db.conscar[strvb(cons, car)] || (this.db.conscar[strvb(cons, car)] = new Set())).add(this.dbId);
    (this.db.conscdr[strvb(cons, cdr)] || (this.db.conscdr[strvb(cons, cdr)] = new Set())).add(this.dbId);
    (this.db.carcdr[strvb(car, cdr)] || (this.db.carcdr[strvb(car, cdr)] = new Set())).add(this.dbId);
    (this.db.cons[cons] || (this.db.cons[cons] = new Set())).add(this.dbId);
    (this.db.car[car] || (this.db.car[car] = new Set())).add(this.dbId);
    (this.db.cdr[cdr] || (this.db.cdr[cdr] = new Set())).add(this.dbId);
}



Fastor.prototype.del = function (cons, car, cdr) {

    let conscar = strvb(cons, car),
        conscdr = strvb(cons, cdr),
        carcdr = strvb(car, cdr);

    let conscarcdr = strvb(conscar, cdr);
    let id = this.conscarcdr[conscarcdr];

    delete this.db.all[id];
    delete this.conscarcdr[conscarcdr];

    if (this.db.cons[cons]) {
        this.db.cons[cons].delete(id);
        if (!this.db.cons[cons].size) delete this.db.cons[cons];
    }

    if (this.db.car[car]) {
        this.db.car[car].delete(id);
        if (!this.db.car[car].size) delete this.db.car[car];
    }

    if (this.db.cdr[cdr]) {
        this.db.cdr[cdr].delete(id);
        if (!this.db.cdr[cdr].size) delete this.db.cdr[cdr];
    }

    if (this.db.conscar[conscar]) {
        this.db.conscar[conscar].delete(id);
        if (!this.db.conscar[conscar].size) delete this.db.conscar[conscar];
    }

    if (this.db.conscdr[conscdr]) {
        this.db.conscdr[conscdr].delete(id);
        if (!this.db.conscdr[conscdr].size) delete this.db.conscdr[conscdr];
    }

    if (this.db.carcdr[carcdr]) {
        this.db.carcdr[carcdr].delete(id);
        if (!this.db.carcdr[carcdr].size) delete this.db.carcdr[carcdr];
    }
}



Fastor.prototype.qry = function (query, blindzone) {

    let result = [];

    if (query.cons) {

        if (query.car) {

            if (query.cdr) {

                result = (this.conscarcdr[strvb(query.cons, query.car, query.cdr)]) || [];

            } else {

                result = this.db.conscar[strvb(query.cons, query.car)] ?
                    [...this.db.conscar[strvb(query.cons, query.car)]] :
                    [];
            }

        } else if (query.cdr) {

            result = this.db.conscdr[strvb(query.cons, query.cdr)] ?
                [...this.db.conscdr[strvb(query.cons, query.cdr)]] :
                [];

        } else {

            result = this.db.cons[query.cons] ?
                [...this.db.cons[query.cons]] :
                [];
        }

    } else if (query.car) {

        if (query.cdr) {

            result = this.db.carcdr[strvb(query.car, query.cdr)] ?
                [...this.db.carcdr[strvb(query.car, query.cdr)]] :
                [];

        } else {

            result = this.db.car[query.car] ?
                [...this.db.car[query.car]] :
                [];
        }

    } else if (query.cdr) {

        result = this.db.cdr[query.cdr] ?
            [...this.db.cdr[query.cdr]] :
            [];

    } else {

        result = Object.keys(this.db.all);
    }

    return result.filter(id => !blindzone.includes(id)).map(id => this.db.all[id]);
}


