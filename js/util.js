


/* ID GENERATOR */

var newId = function() {
    let id = 0;
    return function(prefix) {
        return prefix.toString() + (id++);
    }
}();



/* POSSIBLE PATHS = COMBINATIONS */

function possiblePaths(steps) {

    let max = steps.map(step => step.length);

    let i = Array(steps.length).fill(0);

    let allmax = false;

    let result = [];

    while (!allmax) {

        let current = [];
        for (let s = 0; s < steps.length; s++)
            current.push(steps[s][i[s]]);
        result.push(current);

        ++i[0];
        for (let s = 0; s < steps.length; s++)
            if (i[s] == max[s]) {
                i[s] = 0;
                if (s+1 < i.length)
                    ++i[s+1];
                else
                    allmax = true;
            }
    }
    return result;
}

/*
    console.log(possiblePaths([
        [1, 2, 3],
        [1, 2, 3, 4],
        [1, 2]
    ]));
*/



/* TEMPLATING */

function populate(changeMap, assertions) {

    let result = [];
    for (let cmap of changeMap) {
        result.push(assertions);
        for (let variable in cmap) {
            let re = new RegExp("([^a-zA-Z0-9_]|^)"+variable+"([^a-zA-Z0-9_]|$)", 'g');
            result[result.length-1] = result[result.length-1].replace(re, '$1'+cmap[variable]+'$2');
        }
    }
    return result;
}

/*
    populate( [ {} ], "" )
    populate([ { foo: "bar" }], "meh foo mew")
*/



/* PROLOG-INSPIRED VAR SYNTAX */

function isVar(item) {

	return item == '_' || (item[0] >= 'A' && item[0] <= 'Z');
}



function strvb() { // string with vertical bars

    return Array.from(arguments).join('|');
}