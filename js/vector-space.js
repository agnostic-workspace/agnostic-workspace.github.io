


function VectorSpace() {

	this.contents = [];
	this.angle = false;
    this.sorted = [];
}



VectorSpace.prototype.entry = function(vectorComponents, content, preventSorting) {
	
	this.contents.push({ vector: new Vector(vectorComponents), content });
	if (this.angle && !preventSorting)
		this.sortBySimilarity();
}



VectorSpace.prototype.sortBySimilarity = function(vectorComponents) {
	
	if (vectorComponents)
		this.angle = new Vector(vectorComponents);

	this.contents.sort((a, b) => {
		return b.vector.getDistance(this.angle) - a.vector.getCosineSimilarity(this.angle);
	});

    this.sorted = this.contents.map(entry => entry.content);

	log(this.sorted)
}


