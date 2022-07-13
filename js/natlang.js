


function Natural(consnet) {

    this.vocabulary = {};
    this.cn = consnet;
}



Natural.prototype.word = function(word, arity, meaning) {

    this.vocabulary[word] = { word, arity, meaning };
}



Natural.prototype.parseToTree = function(text) {

    let sentences = text.split('.');

    return sentences.map(s => this.parseSentence(s)[0]).filter(s => !!s);
}



Natural.prototype.parseSentence = function(sentenceString) {

    this.incompleteBlockStack = [];  // logo style
    this.readyBlockStack = [];       // forth style

    let sentence = sentenceString.split(' ').map(w => w.trim()).filter(w => w.length);

    sentence.forEach(word => this.push({ word, args: [] }));

    return this.readyBlockStack;
}



Natural.prototype.getArity = function(input) {

    let word = input.toLowerCase();
    return (word in this.vocabulary) ? this.vocabulary[word].arity : 0;
}



Natural.prototype.push = function(block) {
    
    if (block.args.length < this.getArity(block.word))
        this.pushReady(block);
    else if (this.incompleteBlockStack.length)
        this.pushIncomplete(block);
    else
        this.pushReady(block);
}



Natural.prototype.pushIncomplete = function(block) {

    this.incompleteBlockStack[0].args.push(block);

    if (this.incompleteBlockStack[0].args.length
        == this.getArity(this.incompleteBlockStack[0].word))
            this.push(this.incompleteBlockStack.shift());
}



Natural.prototype.pushReady = function(block) {
    
    while (block.args.length < this.getArity(block.word)
        && this.readyBlockStack.length)
            block.args.push(this.readyBlockStack.shift())

    if (block.args.length < this.getArity(block.word))
        this.incompleteBlockStack.unshift(block);
    else
        this.readyBlockStack.unshift(block);
}



Natural.prototype.stringifyFromTree = function(input) {

    if (Array.isArray(input)) return input.map(b => this.stringifyFromTree(b)+'.').join(' ');

    if (input.args.length == 0) return input.word;

    if (input.args.length == 1) return input.word+' '+this.stringifyFromTree(input.args[0]);

    return this.stringifyFromTree(input.args[0])+' '+input.word+' '+input.args.slice(1).map(arg => this.stringifyFromTree(arg)).join(' ');
}



Natural.prototype.parse = function(input, isQuery) {

    let tree = this.parseToTree(input);

    this.triples = [];

    for (let t of tree)
        this.buildConsnet(t, isQuery);
    
    return this.triples;
}



Natural.prototype.buildConsnet = function(node, isQuery) {

    let instance = isQuery ? newId("Var") : newId("node");
    let word = isVar(node.word) ? newId("Var")+node.word : node.word.toLowerCase();

    word = node.word;

    this.triples.push(instance+" [node_word] "+word);

    let previous = false;
    for (let arg of node.args) {

        let child = this.buildConsnet(arg, isQuery);
        this.triples.push(instance+" [node_down] "+child);

        if (previous)
            this.triples.push(previous+" [node_next] "+child);
        previous = child;
    }

    return instance;
}



Natural.prototype.assert = function(input) {

    this.cn.assert(this.parse(input).join('\n'));
}



Natural.prototype.query = function(input) {

    let q = this.parse(input, true).join(';\n');
    log(q);
    return this.cn.query(q);
}





