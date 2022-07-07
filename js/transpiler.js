


/* GOD OBJECT */

function transpiler(arg) {

    let source = Array.isArray(arg) ? arg[0] : arg;
    let parsed = cnParser.parse(source);

    transpiler.result = [];
    transpiler.references = {};

    for (let part of parsed) transpiler.getSourcePart(part);

    return transpiler.result;
}



/* STRING TEMPLATE FOR ASSERTIONS */

function x() {

    transpiler.isQuery = false;
    return transpiler.call(null, ...arguments);
}



/* STRING TEMPLATE FOR QUERIES */

function q() {

    transpiler.isQuery = true;
    return transpiler.call(null, ...arguments);
}



transpiler.structDef = {};



transpiler.addRef = function(ref, id) {

    if (!transpiler.references[ref])
        transpiler.references[ref] = [];

    transpiler.references[ref].push(id);
}



transpiler.getSourcePart = function(part) {

    if (part.src == "def") transpiler.makeDef(part);
    
    else transpiler.getStructPart(part); 
}



transpiler.makeDef = function(part) {

    transpiler.structDef[part.name.value] = {
        args: part.args.map(a => a.value),
        def: part.def
    }
}



transpiler.baseEnv = {};



transpiler.getStructPart = function(part, placeholders = [transpiler.baseEnv]) {

    if (part.src == "link") transpiler.getTarget(part, placeholders);

    else { // applying structure

        let name = part.name.value;

        if (!transpiler.structDef[name]) throw "unkown structure '"+name+"'";

        let possibleArgs = possiblePaths(part.args);

        let result = [];
        for (let partArgs of possibleArgs)
            result = result.concat(transpiler.getStructPartCombin(name, partArgs, placeholders));
        
        return result;
    }
}



transpiler.getStructPartCombin = function(name, partArgs, placeholders) {

    let newPlaceholders = Array.from(placeholders);
    newPlaceholders.unshift({});
    let pos = 0;

    for (let arg of transpiler.structDef[name].args) {
        newPlaceholders[0][arg] = transpiler.getPlaceholder(partArgs[pos++], placeholders);
        if (!Array.isArray(newPlaceholders[0][arg]))
            newPlaceholders[0][arg] = [newPlaceholders[0][arg]];
    }

    let result = [];
    for (let defpart of transpiler.structDef[name].def)
        result = result.concat(transpiler.getStructPart(defpart, newPlaceholders));
    return result;
}



transpiler.getTarget = function(target, placeholders = [transpiler.baseEnv]) {

    if (target.src == "link") {

        return transpiler.getLink(target, placeholders);

    } else if (target.src == "terminal") {

        return transpiler.references[target.value] || [target.value];

    } else

        return transpiler.getPlaceholder(target, placeholders);
}



transpiler.getPlaceholder = function(target, placeholders) {

    if (target.src == "placeholder") {

        for (let level of placeholders)
            if (target.value in level) {
                let result = [];
                level[target.value].forEach(
                    p => result = result.concat(transpiler.getTarget(p, placeholders))
                );
                return result;
            }

    } else return target;
}



transpiler.getLink = function(target, placeholders) {

    let left = [],
        right = [];

    let result = [];

    for (let l of target.left) left = left.concat(transpiler.getTarget(l, placeholders));
    for (let r of target.right) right = right.concat(transpiler.getTarget(r, placeholders));

    for (let l of left) for (let r of right) {

        let id = ((target.ref && transpiler.isQuery && isVar(target.ref.value))) ?
            transpiler.makeConscell(l, r, target.ref.value) :
            transpiler.makeConscell(l, r);
        if (target.ref && (target.ref.value != id)) transpiler.addRef(target.ref.value, id);

        result.push(id);
    }
    
    if (target.type != '|') {

        let inline = [];
        target.type.forEach(t => inline = inline.concat(transpiler.getTarget(t, placeholders)));

        for (let r of result)
            for (let i of inline) {
                let id = ((target.ref && transpiler.isQuery && isVar(target.ref.value))) ?
                    transpiler.makeConscell(r, i, target.ref.value) :
                    transpiler.makeConscell(r, i);
                if (target.ref && (target.ref.value != id)) transpiler.addRef(target.ref.value, id);
            }
            
    }
    
    return result;
}



transpiler.knownPairs = {};



transpiler.pairId = function(left, right) {

    let id;
    let type = transpiler.isQuery ? 'Var' : 'cons';

    if (!transpiler.knownPairs[left]) {

        id = newId(type);
        if (!transpiler.isQuery)
            transpiler.knownPairs[left] = { [right]: id };

    } else if (!transpiler.knownPairs[left][right]) {

        id = newId(type);
        if (!transpiler.isQuery)
            transpiler.knownPairs[left][right] = id;

    } else id = transpiler.knownPairs[left][right];
    
    return id;
}



transpiler.makeConscell = function(left, right, id = transpiler.pairId(left, right)) {

    transpiler.result.push({ cons: id, car:left, cdr: right });
    return id;
}



