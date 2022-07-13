


/*
// stress test et cas classiques

let imax = 1000;

let stress = []
for (let i = 0; i < imax; i++)
	stress.push("zero"+i+" [has] item"+Math.floor(i * Math.random()));
stress = stress.join('\n');



let cn = new Consnet();



cn.assert(`

	$ owns <owner> <thing> {
		<owner> [has] <thing>
		<owner> [is] "some owner"
	}

	$ owns zero (television, radio, car, moto)

	test: janet | bicycle, legs
	test | has

	moto, car [is] vehicle

`);

cn.assert(stress);



cn.qRetract("zero [has] Something", "Something [is] vehicle");
	
cn.qAssert("Someone [has] legs", "Someone [is] beautiful")



log("[QASSERTING]")

for (let i = 0; i < imax; i++)
	cn.qAssert("zero"+i+" [has] SomeItem", "SomeItem [has] owner")



let myq = `

(Who | What) | has
Test: Who | moto
Test | has

`;

myq = `Subject [is] Object`;



log("[QUERYING]")

cn.query(myq, r => { log(populate([r], myq)) });

*/





























/*

// embedded in PEG tests

function Converter(source) {

	let parsed = langParser.parse(source);

	console.log("[PARSE]", parsed);
	
	this.parser = peg.generate(parsed.grammar);

	this.patterns = {};
	this.buildPatterns(parsed.builder);
}



Converter.prototype.buildPatterns = function(builder) {

	for (let rule in builder) {

		if (!this.patterns[rule]) this.patterns[rule] = [];

		let pattern = {};

		this.patterns[rule].push(pattern);
	}
}



Converter.prototype.parse = function(source) {

	return this.parser.parse(source);
}



Converter.prototype.realize = function(consnet) {

}



let grammar = `


Sentence "sentence"
= Subject:Word _ Verb:Word _ Object:Word _ {

@ [hasSubject] Subject
@ [hasVerb] Verb
@ [hasObject] Object
}

_
= " "* { }

Word
= w:$[^ ]+ { @ [is] w }


`;

let conv = new Converter(grammar);




let test = `gato xasa scural`;

let final = conv.parse(test);

console.log("[FINAL]", final)



let cn = new Consnet();


cn.assert(final);

console.log(
cn.query("A|B")
)
*/














/*
let cn = new Consnet();

cn.assert(`

$ owns <owner> <thing> {
	<owner> [has] <thing>
	<owner> [is] "some owner"
}

$ owns zero (television, radio, car, moto)

test: janet | bicycle, legs
test | has

moto, car [is] vehicle

`);


cn.group("Something [is] vehicle", "mobile");


log(
	cn.query("What | mobile")
)

*/



/*

let cn = new Consnet();

cn.assert(`

zero [is] one, two, three, four, five
two, four [is] even

`);




//cn.group("NB [is] even", "test_group");

//log(cn.fcn.fs.db)

log(cn.query("NB [is] even"));

*/








let cn = new Consnet();

let nat = new Natural(cn);

nat.word("le", 1);
nat.word("la", 1);
nat.word("chat", 0);
nat.word("donne", 3);
nat.word("une", 1);
nat.word("un", 1);
nat.word("fromage", 0);
nat.word("souris", 0);
nat.word("a", 1);
nat.word("x", 0);


//let parsedTree = nat.parseToTree(str);

//log(parsedTree);

//log(nat.stringifyFromTree(parsedTree))

let str1 = "le chat donne un fromage a la souris.";
let str2 = "le chat donne Quoi a Qui.";

//log(nat.parse(str1, false))
//log(nat.parse(str2, true))

nat.assert(str1);
log(nat.query(str2));


log(Object.values(cn.fcn.fs.db.all))

