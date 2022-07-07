


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

    if (this.conscarcdr[cons + '|' + car + '|' + cdr]) return;

    this.db.all[++this.dbId] = { cons, car, cdr };
    this.conscarcdr[cons + '|' + car + '|' + cdr] = this.dbId;

    (this.db.conscar[cons + '|' + car] || (this.db.conscar[cons + '|' + car] = new Set())).add(this.dbId);
    (this.db.conscdr[cons + '|' + cdr] || (this.db.conscdr[cons + '|' + cdr] = new Set())).add(this.dbId);
    (this.db.carcdr[car + '|' + cdr] || (this.db.carcdr[car + '|' + cdr] = new Set())).add(this.dbId);
    (this.db.cons[cons] || (this.db.cons[cons] = new Set())).add(this.dbId);
    (this.db.car[car] || (this.db.car[car] = new Set())).add(this.dbId);
    (this.db.cdr[cdr] || (this.db.cdr[cdr] = new Set())).add(this.dbId);
}



Fastor.prototype.del = function (cons, car, cdr) {

    let conscar = cons + '|' + car,
        conscdr = cons + '|' + cdr,
        carcdr = car + '|' + cdr;

    this.conscarcdr.delete(conscar + '|' + cdr);

    if (this.db.cons[cons]) {
        this.db.cons[cons].delete(carcdr);
        if (!this.db.cons[cons].size) delete this.db.cons[cons];
    }

    if (this.db.car[car]) {
        this.db.car[car].delete(conscdr);
        if (!this.db.car[car].size) delete this.db.car[car];
    }

    if (this.db.cdr[cdr]) {
        this.db.cdr[cdr].delete(conscar);
        if (!this.db.cdr[cdr].size) delete this.db.cdr[cdr];
    }

    if (this.db.conscar[conscar]) {
        this.db.conscar[conscar].delete(cdr);
        if (!this.db.conscar[conscar].size) delete this.db.conscar[conscar];
    }

    if (this.db.conscdr[conscdr]) {
        this.db.conscdr[conscdr].delete(car);
        if (!this.db.conscdr[conscdr].size) delete this.db.conscdr[conscdr];
    }

    if (this.db.carcdr[carcdr]) {
        this.db.carcdr[carcdr].delete(cons);
        if (!this.db.carcdr[carcdr].size) delete this.db.carcdr[carcdr];
    }
}



Fastor.prototype.qry = function (query) {

    if (query.cons) {

        if (query.car) {

            if (query.cdr) {

                return (this.conscarcdr.has(query.cons + '|' + query.car + '|' + query.cdr)) ?
                    [{ cons: query.cons, car: query.car, cdr: query.cdr }] :
                    [];

            } else {

                return this.db.conscar[query.cons + '|' + query.car] ?
                    [...this.db.conscar[query.cons + '|' + query.car]].map(id => this.db.all[id]) :
                    [];
            }

        } else if (query.cdr) {

            return this.db.conscdr[query.cons + '|' + query.cdr] ?
                [...this.db.conscdr[query.cons + '|' + query.cdr]].map(id => this.db.all[id]) :
                [];

        } else {

            return this.db.cons[query.cons] ?
                [...this.db.cons[query.cons]].map(id => this.db.all[id]) :
                [];
        }

    } else if (query.car) {

        if (query.cdr) {

            return this.db.carcdr[query.car + '|' + query.cdr] ?
                [...this.db.carcdr[query.car + '|' + query.cdr]].map(id => this.db.all[id]) :
                [];

        } else {

            return this.db.car[query.car] ?
                [...this.db.car[query.car]].map(id => this.db.all[id]) :
                [];
        }

    } else if (query.cdr) {

        return this.db.cdr[query.cdr] ?
            [...this.db.cdr[query.cdr]].map(id => this.db.all[id]) :
            [];

    } else {

        return Object.values(this.db.all);
    }
}


