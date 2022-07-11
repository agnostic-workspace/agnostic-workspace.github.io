


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



console.log("[QASSERTING]")

for (let i = 0; i < imax; i++)
	cn.qAssert("zero"+i+" [has] SomeItem", "SomeItem [has] owner")



let myq = `

(Who | What) | has
Test: Who | moto
Test | has

`;

myq = `Subject [is] Object`;



console.log("[QUERYING]")

cn.query(myq, r => { ui.t(populate([r], myq)) });


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

let vs = new VectorSpace();

vs.entry({ importance: 2, urgency: 5}, "some value 1");
vs.entry({ importance: 3, urgency: 4}, "some value 2");
vs.entry({ importance: 5, urgency: 2}, "some value 4");
vs.entry({ importance: 6, urgency: 1}, "some value 5");

vs.sortBySimilarity({ importance: -10, urgency: 10 });
//log(vs.contents)

vs.sortBySimilarity({ importance: 10, urgency: -10 });

vs.entry({ importance: 4, urgency: 3}, "some value 3");
//log(vs.contents)
*/



let cn = new Consnet();

cn.assert(`

zero [owns] television, radio, car, moto

moto, car [is] vehicle

toy [has] four_wheels

car [has] four_wheels

`);



let st = new Storyteller(cn);

st.teller("Someone [owns] Something", { priority: 90 }, function(binding, collections) {

	return binding.Someone+" has a "+binding.Something+". ";
});

st.teller("Something [has] four_wheels", { priority: 50 }, function(binding, collections) {

	return "A "+binding.Something+" has 4 wheels. ";
});

st.angle({ priority: 100 });

log(
	st.tell()
);

st.angle({ priority: 0 });

log(
	st.tell()
);


// this thing is all fucked up
// wrong way