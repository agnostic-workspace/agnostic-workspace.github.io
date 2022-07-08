(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
const { errors } = require('./errors/parsing.js');
const matcher = require('./grammar_matcher.js');
const {
  COMMENT,
  CONTINUATION,
  DOCUMENT,
  EMPTY,
  END,
  FIELD,
  FIELDSET,
  FIELDSET_ENTRY,
  FIELD_OR_FIELDSET_OR_LIST,
  LIST,
  LIST_ITEM,
  MULTILINE_FIELD_BEGIN,
  MULTILINE_FIELD_END,
  MULTILINE_FIELD_VALUE,
  SECTION,
  UNPARSED
} = require('./constants.js');

const parseAfterError = (context, index, line, errorInstruction = null) => {
  if(errorInstruction) {
    context._meta.push(errorInstruction);
    index = errorInstruction.ranges.line[END];
    line++;
  }

  while(index < context._input.length) {
    let endOfLineIndex = context._input.indexOf('\n', index);

    if(endOfLineIndex === -1) {
      endOfLineIndex = context._input.length;
    }

    const instruction = {
      line: line,
      ranges: { line: [index, endOfLineIndex] },
      type: UNPARSED
    };

    if(errorInstruction === null) {
      errorInstruction = instruction;
    }

    context._meta.push(instruction);
    index = endOfLineIndex + 1;
    line++;
  }

  context._lineCount = context._input[context._input.length - 1] === '\n' ? line + 1 : line;

  return errorInstruction;
};

exports.analyze = function() {
  this._document = {
    depth: 0,
    elements: [],
    type: DOCUMENT
  };

  // TODO: Possibly flatten into two properties?
  this.copy = {
    nonSectionElements: {},
    sections: {}
  };

  this._meta = [];

  if(this._input.length === 0) {
    this._lineCount = 1;
    return;
  }

  let comments = null;
  let lastContinuableElement = null;
  let lastNonSectionElement = null;
  let lastSection = this._document;

  let index = 0;
  let line = 0;
  const matcherRegex = matcher.GRAMMAR_REGEXP;
  matcherRegex.lastIndex = index;

  let instruction;

  while(index < this._input.length) {
    const match = matcherRegex.exec(this._input);

    if(match === null) {
      instruction = parseAfterError(this, index, line);
      throw errors.invalidLine(this, instruction);
    } else {
      instruction = {
        line: line,
        ranges: {
          line: [index, matcherRegex.lastIndex]
        }
      };
    }

    if(match[matcher.EMPTY_LINE_INDEX] !== undefined) {

      if(comments) {
        this._meta.push(...comments);
        comments = null;
      }

    } else if(match[matcher.ELEMENT_OPERATOR_INDEX] !== undefined) {

      if(comments) {
        instruction.comments = comments;
        comments = null;
      }

      instruction.key = match[matcher.KEY_UNESCAPED_INDEX];

      let elementOperatorIndex;
      if(instruction.key !== undefined) {
        const keyIndex = this._input.indexOf(instruction.key, index);
        elementOperatorIndex = this._input.indexOf(':', keyIndex + instruction.key.length);

        instruction.ranges.elementOperator = [elementOperatorIndex, elementOperatorIndex + 1];
        instruction.ranges.key = [keyIndex, keyIndex + instruction.key.length];
      } else {
        instruction.key = match[matcher.KEY_ESCAPED_INDEX];

        const escapeOperator = match[matcher.KEY_ESCAPE_BEGIN_OPERATOR_INDEX];
        const escapeBeginOperatorIndex = this._input.indexOf(escapeOperator, index);
        const keyIndex = this._input.indexOf(instruction.key, escapeBeginOperatorIndex + escapeOperator.length);
        const escapeEndOperatorIndex = this._input.indexOf(escapeOperator, keyIndex + instruction.key.length);
        elementOperatorIndex = this._input.indexOf(':', escapeEndOperatorIndex + escapeOperator.length);

        instruction.ranges.escapeBeginOperator = [escapeBeginOperatorIndex, escapeBeginOperatorIndex + escapeOperator.length];
        instruction.ranges.escapeEndOperator = [escapeEndOperatorIndex, escapeEndOperatorIndex + escapeOperator.length];
        instruction.ranges.elementOperator = [elementOperatorIndex, elementOperatorIndex + 1];
        instruction.ranges.key = [keyIndex, keyIndex + instruction.key.length];
      }

      const value = match[matcher.FIELD_VALUE_INDEX];
      if(value) {
        instruction.continuations = [];
        instruction.type = FIELD;
        instruction.value = value;

        const valueIndex = this._input.indexOf(value, elementOperatorIndex + 1);
        instruction.ranges.value = [valueIndex, valueIndex + value.length];
      } else {
        instruction.type = FIELD_OR_FIELDSET_OR_LIST;
      }

      instruction.parent = lastSection;
      lastSection.elements.push(instruction);
      lastContinuableElement = instruction;
      lastNonSectionElement = instruction;

    } else if(match[matcher.LIST_ITEM_OPERATOR_INDEX] !== undefined) {

      if(comments) {
        instruction.comments = comments;
        comments = null;
      }

      instruction.continuations = [];  // TODO: Forward allocation of this kind is planned to be removed like in python implementation
      instruction.type = LIST_ITEM;
      instruction.value = match[matcher.LIST_ITEM_VALUE_INDEX] || null;

      const operatorIndex = this._input.indexOf('-', index);

      instruction.ranges.itemOperator = [operatorIndex, operatorIndex + 1];

      if(instruction.value) {
        const valueIndex = this._input.indexOf(instruction.value, operatorIndex + 1);
        instruction.ranges.value = [valueIndex, valueIndex + instruction.value.length];
      }

      if(lastNonSectionElement === null) {
        parseAfterError(this, index, line, instruction);
        throw errors.missingListForListItem(this, instruction);
      } else if(lastNonSectionElement.type === LIST) {
        lastNonSectionElement.items.push(instruction);
      } else if(lastNonSectionElement.type === FIELD_OR_FIELDSET_OR_LIST) {
        lastNonSectionElement.items = [instruction];
        lastNonSectionElement.type = LIST;
      } else {
        parseAfterError(this, index, line, instruction);
        throw errors.missingListForListItem(this, instruction);
      }

      instruction.parent = lastNonSectionElement;
      lastContinuableElement = instruction;

    } else if(match[matcher.FIELDSET_ENTRY_OPERATOR_INDEX] !== undefined) {

      if(comments) {
        instruction.comments = comments;
        comments = null;
      }

      instruction.continuations = []; // TODO: Only create ad-hoc, remove here and elsewhere, generally follow this pattern of allocation sparsity
      instruction.type = FIELDSET_ENTRY;

      let entryOperatorIndex;

      if(match[matcher.KEY_UNESCAPED_INDEX] === undefined) {
        instruction.key = match[matcher.KEY_ESCAPED_INDEX];

        const escapeOperator = match[matcher.KEY_ESCAPE_BEGIN_OPERATOR_INDEX];
        const escapeBeginOperatorIndex = this._input.indexOf(escapeOperator, index);
        const keyIndex = this._input.indexOf(instruction.key, escapeBeginOperatorIndex + escapeOperator.length);
        const escapeEndOperatorIndex = this._input.indexOf(escapeOperator, keyIndex + instruction.key.length);
        entryOperatorIndex = this._input.indexOf('=', escapeEndOperatorIndex + escapeOperator.length);

        instruction.ranges.escapeBeginOperator = [escapeBeginOperatorIndex, escapeBeginOperatorIndex + escapeOperator.length];
        instruction.ranges.escapeEndOperator = [escapeEndOperatorIndex, escapeEndOperatorIndex + escapeOperator.length];
        instruction.ranges.entryOperator = [entryOperatorIndex, entryOperatorIndex + 1];
        instruction.ranges.key = [keyIndex, keyIndex + instruction.key.length];
      } else {
        instruction.key = match[matcher.KEY_UNESCAPED_INDEX];

        const keyIndex = this._input.indexOf(instruction.key, index);
        entryOperatorIndex = this._input.indexOf('=', keyIndex + instruction.key.length);

        instruction.ranges.entryOperator = [entryOperatorIndex, entryOperatorIndex + 1];
        instruction.ranges.key = [keyIndex, keyIndex + instruction.key.length];
      }

      if(match[matcher.FIELDSET_ENTRY_VALUE_INDEX] === undefined) {
        instruction.value = null;
      } else {
        instruction.value = match[matcher.FIELDSET_ENTRY_VALUE_INDEX];

        const valueIndex = this._input.indexOf(instruction.value, entryOperatorIndex + 1);
        instruction.ranges.value = [valueIndex, valueIndex + instruction.value.length];
      }

      if(lastNonSectionElement === null) {
        parseAfterError(this, index, line, instruction);
        throw errors.missingFieldsetForFieldsetEntry(this, instruction);
      } else if(lastNonSectionElement.type === FIELDSET) {
        lastNonSectionElement.entries.push(instruction);
      } else if(lastNonSectionElement.type === FIELD_OR_FIELDSET_OR_LIST) {
        lastNonSectionElement.entries = [instruction];
        lastNonSectionElement.type = FIELDSET;
      } else {
        parseAfterError(this, index, line, instruction);
        throw errors.missingFieldsetForFieldsetEntry(this, instruction);
      }

      instruction.parent = lastNonSectionElement;
      lastContinuableElement = instruction;

    } else if(match[matcher.SPACED_LINE_CONTINUATION_OPERATOR_INDEX] !== undefined) {

      instruction.spaced = true;
      instruction.type = CONTINUATION;

      const operatorIndex = this._input.indexOf('\\', index);
      instruction.ranges.spacedLineContinuationOperator = [operatorIndex, operatorIndex + 1];

      if(match[matcher.SPACED_LINE_CONTINUATION_VALUE_INDEX] === undefined) {
        instruction.value = null;
      } else {
        instruction.value = match[matcher.SPACED_LINE_CONTINUATION_VALUE_INDEX];

        const valueIndex = this._input.indexOf(instruction.value, operatorIndex + 1);
        instruction.ranges.value = [valueIndex, valueIndex + instruction.value.length];
      }

      if(lastContinuableElement === null) {
        parseAfterError(this, index, line, instruction);
        throw errors.missingElementForContinuation(this, instruction);
      }

      if(lastContinuableElement.type === FIELD_OR_FIELDSET_OR_LIST) {
        lastContinuableElement.continuations = [instruction];
        lastContinuableElement.type = FIELD;
      } else {
        lastContinuableElement.continuations.push(instruction);
      }

      if(comments) {
        this._meta.push(...comments);
        comments = null;
      }


    } else if(match[matcher.DIRECT_LINE_CONTINUATION_OPERATOR_INDEX] !== undefined) {

      instruction.spaced = false;  // TODO: Just leave out
      instruction.type = CONTINUATION;

      const operatorIndex = this._input.indexOf('|', index);
      instruction.ranges.directLineContinuationOperator = [operatorIndex, operatorIndex + 1];

      if(match[matcher.DIRECT_LINE_CONTINUATION_VALUE_INDEX] !== undefined) {
        instruction.value = match[matcher.DIRECT_LINE_CONTINUATION_VALUE_INDEX];
        const valueIndex = this._input.indexOf(instruction.value, operatorIndex + 1);
        instruction.ranges.value = [valueIndex, valueIndex + instruction.value.length];
      } else {
        instruction.value = null;
      }

      if(lastContinuableElement === null) {
        parseAfterError(this, index, line, instruction);
        throw errors.missingElementForContinuation(this, instruction);
      }

      if(lastContinuableElement.type === FIELD_OR_FIELDSET_OR_LIST) {
        lastContinuableElement.continuations = [instruction];
        lastContinuableElement.type = FIELD;
      } else {
        lastContinuableElement.continuations.push(instruction);
      }

      if(comments) {
        this._meta.push(...comments);
        comments = null;
      }

    } else if(match[matcher.SECTION_OPERATOR_INDEX] !== undefined) {

      if(comments) {
        instruction.comments = comments;
        comments = null;
      }

      const sectionOperator = match[matcher.SECTION_OPERATOR_INDEX];

      instruction.depth = sectionOperator.length;
      instruction.elements = [];
      instruction.type = SECTION;

      const sectionOperatorIndex = this._input.indexOf(sectionOperator, index);
      instruction.key = match[matcher.SECTION_KEY_UNESCAPED_INDEX];
      let keyEndIndex;

      if(instruction.key !== undefined) {
        const keyIndex = this._input.indexOf(instruction.key, sectionOperatorIndex + sectionOperator.length);
        keyEndIndex = keyIndex + instruction.key.length;

        instruction.ranges.key = [keyIndex, keyIndex + instruction.key.length];
        instruction.ranges.sectionOperator = [sectionOperatorIndex, sectionOperatorIndex + sectionOperator.length];
      } else {
        instruction.key = match[matcher.SECTION_KEY_ESCAPED_INDEX];

        const escapeOperator = match[matcher.SECTION_KEY_ESCAPE_BEGIN_OPERATOR_INDEX];
        const escapeBeginOperatorIndex = this._input.indexOf(escapeOperator, sectionOperatorIndex + sectionOperator.length);
        const keyIndex = this._input.indexOf(instruction.key, escapeBeginOperatorIndex + escapeOperator.length);
        const escapeEndOperatorIndex = this._input.indexOf(escapeOperator, keyIndex + instruction.key.length);
        keyEndIndex = escapeEndOperatorIndex + escapeOperator.length;

        instruction.ranges.escapeBeginOperator = [escapeBeginOperatorIndex, escapeBeginOperatorIndex + escapeOperator.length];
        instruction.ranges.escapeEndOperator = [escapeEndOperatorIndex, escapeEndOperatorIndex + escapeOperator.length];
        instruction.ranges.key = [keyIndex, keyIndex + instruction.key.length];
        instruction.ranges.sectionOperator = [sectionOperatorIndex, sectionOperatorIndex + sectionOperator.length];
      }

      if(match[matcher.SECTION_TEMPLATE_INDEX] !== undefined) {
        instruction.template = match[matcher.SECTION_TEMPLATE_INDEX];

        const copyOperator = match[matcher.SECTION_COPY_OPERATOR_INDEX];
        const copyOperatorIndex = this._input.indexOf(copyOperator, keyEndIndex);
        const templateIndex = this._input.indexOf(instruction.template, copyOperatorIndex + copyOperator.length);

        instruction.deepCopy = copyOperator.length > 1;

        if(instruction.deepCopy) {
          instruction.ranges.deepCopyOperator = [copyOperatorIndex, copyOperatorIndex + copyOperator.length];
        } else {
          instruction.ranges.copyOperator = [copyOperatorIndex, copyOperatorIndex + copyOperator.length];
        }

        instruction.ranges.template = [templateIndex, templateIndex + instruction.template.length];

        if(this.copy.sections.hasOwnProperty(instruction.template)) {
          this.copy.sections[instruction.template].targets.push(instruction);
        } else {
          this.copy.sections[instruction.template] = { targets: [instruction] };
        }

        instruction.copy = this.copy.sections[instruction.template];
      }

      if(instruction.depth === lastSection.depth + 1) {
        instruction.parent = lastSection;
      } else if(instruction.depth === lastSection.depth) {
        instruction.parent = lastSection.parent;
      } else if(instruction.depth < lastSection.depth) {
        while(instruction.depth < lastSection.depth) {
          lastSection = lastSection.parent;
        }

        instruction.parent = lastSection.parent;
      } else {
        parseAfterError(this, index, line, instruction);
        throw errors.sectionHierarchyLayerSkip(this, instruction, lastSection);
      }

      instruction.parent.elements.push(instruction);

      if(instruction.hasOwnProperty('template')) {
        for(let parent = instruction.parent; parent.type !== DOCUMENT; parent = parent.parent) {
          parent.deepResolve = true;
        }
      }

      lastSection = instruction;
      lastContinuableElement = null;
      lastNonSectionElement = null; // TODO: Actually wrong terminology - it's a Field/List/Fieldset but can't be List Item or Fieldset Entry!

    } else if(match[matcher.MULTILINE_FIELD_OPERATOR_INDEX] !== undefined) {

      if(comments) {
        instruction.comments = comments;
        comments = null;
      }

      const operator = match[matcher.MULTILINE_FIELD_OPERATOR_INDEX];

      instruction.key = match[matcher.MULTILINE_FIELD_KEY_INDEX];
      instruction.lines = [];
      instruction.type = MULTILINE_FIELD_BEGIN;

      let operatorIndex = this._input.indexOf(operator, index);
      let keyIndex = this._input.indexOf(instruction.key, operatorIndex + operator.length);

      instruction.ranges.multilineFieldOperator = [operatorIndex, operatorIndex + operator.length];
      instruction.ranges.key = [keyIndex, keyIndex + instruction.key.length];

      index = matcherRegex.lastIndex + 1;
      line += 1;

      instruction.parent = lastSection;
      lastSection.elements.push(instruction);

      lastContinuableElement = null;
      lastNonSectionElement = instruction;

      const keyEscaped = instruction.key.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
      const terminatorMatcher = new RegExp(`[^\\S\\n]*(${operator})(?!-)[^\\S\\n]*(${keyEscaped})[^\\S\\n]*(?=\\n|$)`, 'y');

      while(true) {
        terminatorMatcher.lastIndex = index;
        let terminatorMatch = terminatorMatcher.exec(this._input);

        if(terminatorMatch) {
          operatorIndex = this._input.indexOf(operator, index);
          keyIndex = this._input.indexOf(instruction.key, operatorIndex + operator.length);

          instruction = {
            line: line,
            ranges: {
              line: [index, terminatorMatcher.lastIndex],
              multilineFieldOperator: [operatorIndex, operatorIndex + operator.length],
              key: [keyIndex, keyIndex + instruction.key.length]
            },
            type: MULTILINE_FIELD_END
          };

          lastNonSectionElement.end = instruction;
          lastNonSectionElement = null;

          matcherRegex.lastIndex = terminatorMatcher.lastIndex;

          break;
        } else {
          const endofLineIndex = this._input.indexOf('\n', index);

          if(endofLineIndex === -1) {
            lastNonSectionElement.lines.push({
              line: line,
              ranges: {
                line: [index, this._input.length],
                value: [index, this._input.length]  // TODO: line range === value range, drop value range? (see how the custom terminal reporter eg. handles this for syntax coloring, then revisit)
              },
              type: MULTILINE_FIELD_VALUE
            });

            throw errors.unterminatedMultilineField(this, instruction);
          } else {
            lastNonSectionElement.lines.push({
              line: line,
              ranges: {
                line: [index, endofLineIndex],
                value: [index, endofLineIndex]  // TODO: line range === value range, drop value range? (see how the custom terminal reporter eg. handles this for syntax coloring, then revisit)
              },
              type: MULTILINE_FIELD_VALUE
            });

            index = endofLineIndex + 1;
            line++;
          }
        }
      }

    } else if(match[matcher.TEMPLATE_INDEX] !== undefined) {

      if(comments) {
        instruction.comments = comments;
        comments = null;
      }

      instruction.template = match[matcher.TEMPLATE_INDEX]; // TODO: We can possibly make this ephemeral (local variable) because the new copyData reference replaces its function
      instruction.type = FIELD_OR_FIELDSET_OR_LIST;

      let copyOperatorIndex;

      instruction.key = match[matcher.KEY_UNESCAPED_INDEX];

      if(instruction.key !== undefined) {
        const keyIndex = this._input.indexOf(instruction.key, index);
        instruction.ranges.key = [keyIndex, keyIndex + instruction.key.length];

        copyOperatorIndex = this._input.indexOf('<', keyIndex + instruction.key.length);
      } else {
        instruction.key = match[matcher.KEY_ESCAPED_INDEX];

        const escapeOperator = match[matcher.KEY_ESCAPE_BEGIN_OPERATOR_INDEX];
        const escapeBeginOperatorIndex = this._input.indexOf(escapeOperator, index);
        const keyIndex = this._input.indexOf(instruction.key, escapeBeginOperatorIndex + escapeOperator.length);
        const escapeEndOperatorIndex = this._input.indexOf(escapeOperator, keyIndex + instruction.key.length);

        instruction.ranges.escapeBeginOperator = [escapeBeginOperatorIndex, escapeBeginOperatorIndex + escapeOperator.length];
        instruction.ranges.key = [keyIndex, keyIndex + instruction.key.length];
        instruction.ranges.escapeEndOperator = [escapeEndOperatorIndex, escapeEndOperatorIndex + escapeOperator.length];

        copyOperatorIndex = this._input.indexOf('<', escapeEndOperatorIndex + escapeOperator.length);
      }

      instruction.ranges.copyOperator = [copyOperatorIndex, copyOperatorIndex + 1];

      const templateIndex = this._input.indexOf(instruction.template, copyOperatorIndex + 1);
      instruction.ranges.template = [templateIndex, templateIndex + instruction.template.length];

      instruction.parent = lastSection;
      lastSection.elements.push(instruction);
      lastContinuableElement = null;
      lastNonSectionElement = instruction;

      if(this.copy.nonSectionElements.hasOwnProperty(instruction.template)) {
        this.copy.nonSectionElements[instruction.template].targets.push(instruction);
      } else {
        this.copy.nonSectionElements[instruction.template] = { targets: [instruction] };
      }

      instruction.copy = this.copy.nonSectionElements[instruction.template];

    } else if(match[matcher.COMMENT_OPERATOR_INDEX] !== undefined) {

      if(comments === null) {
        comments = [instruction];
      } else {
        comments.push(instruction);
      }

      instruction.type = COMMENT;

      const operatorIndex = this._input.indexOf('>', index);
      instruction.ranges.commentOperator = [operatorIndex, operatorIndex + 1];

      if(match[matcher.COMMENT_INDEX] !== undefined) {
        instruction.comment = match[matcher.COMMENT_INDEX];

        const commentIndex = this._input.indexOf(instruction.comment, operatorIndex + 1);
        instruction.ranges.comment = [commentIndex, commentIndex + instruction.comment.length];
      } else {
        instruction.comment = null;
      }

    } else if(match[matcher.KEY_UNESCAPED_INDEX] !== undefined) {

      if(comments) {
        instruction.comments = comments;
        comments = null;
      }

      instruction.key = match[matcher.KEY_UNESCAPED_INDEX];
      instruction.type = EMPTY;

      const keyIndex = this._input.indexOf(instruction.key, index);

      instruction.ranges.key = [keyIndex, keyIndex + instruction.key.length];

      instruction.parent = lastSection;
      lastSection.elements.push(instruction);
      lastContinuableElement = null;
      lastNonSectionElement = instruction;

    } else if(match[matcher.KEY_ESCAPED_INDEX] !== undefined) {

      if(comments) {
        instruction.comments = comments;
        comments = null;
      }

      instruction.key = match[matcher.KEY_ESCAPED_INDEX];
      instruction.type = EMPTY;

      const escapeOperator = match[matcher.KEY_ESCAPE_BEGIN_OPERATOR_INDEX];
      const escapeBeginOperatorIndex = this._input.indexOf(escapeOperator, index);
      const keyIndex = this._input.indexOf(instruction.key, escapeBeginOperatorIndex + escapeOperator.length);
      const escapeEndOperatorIndex = this._input.indexOf(escapeOperator, keyIndex + instruction.key.length);

      instruction.ranges.escapeBeginOperator = [escapeBeginOperatorIndex, escapeBeginOperatorIndex + escapeOperator.length];
      instruction.ranges.escapeEndOperator = [escapeEndOperatorIndex, escapeEndOperatorIndex + escapeOperator.length];
      instruction.ranges.key = [keyIndex, keyIndex + instruction.key.length];

      instruction.parent = lastSection;
      lastSection.elements.push(instruction);
      lastContinuableElement = null;
      lastNonSectionElement = instruction;

    }

    line += 1;
    index = matcherRegex.lastIndex + 1;
    matcherRegex.lastIndex = index;
  } // ends while(index < this._input.length) {

  this._lineCount = this._input[this._input.length - 1] === '\n' ? line + 1 : line;

  if(comments) {
    this._meta.push(...comments);
  }
};

},{"./constants.js":2,"./errors/parsing.js":25,"./grammar_matcher.js":28}],2:[function(require,module,exports){
// Added to 0-indexed indices in a few places
exports.HUMAN_INDEXING = 1;

// Selection indices
exports.BEGIN = 0;
exports.END = 1;

// Instruction types
exports.COMMENT = Symbol('Comment');
exports.CONTINUATION = Symbol('Continuation');
exports.DOCUMENT = Symbol('Document');
exports.EMPTY = Symbol('Empty');
exports.FIELD = Symbol('Field');
exports.FIELDSET = Symbol('Fieldset');
exports.FIELDSET_ENTRY = Symbol('Fieldset Entry');
exports.FIELD_OR_FIELDSET_OR_LIST = Symbol('Field, Fieldset or List');
exports.LIST = Symbol('List');
exports.LIST_ITEM = Symbol('List Item');
exports.MULTILINE_FIELD_BEGIN = Symbol('Multiline Field Begin');
exports.MULTILINE_FIELD_END = Symbol('Multiline Field End');
exports.MULTILINE_FIELD_VALUE = Symbol('Multiline Field Value');
exports.SECTION = Symbol('Section');
exports.UNPARSED = Symbol('Unparsed');

// Maps instruction type symbols to printable strings
exports.PRETTY_TYPES = {
  [exports.DOCUMENT]: 'document',
  [exports.EMPTY]: 'empty',
  [exports.FIELD]: 'field',
  [exports.FIELDSET]: 'fieldset',
  [exports.FIELDSET_ENTRY]: 'fieldsetEntry',
  [exports.FIELD_OR_FIELDSET_OR_LIST]: 'fieldOrFieldsetOrList',
  [exports.LIST]: 'list',
  [exports.LIST_ITEM]: 'listItem',
  [exports.MULTILINE_FIELD_BEGIN]: 'field',
  [exports.SECTION]: 'section'
};

},{}],3:[function(require,module,exports){
const { analyze } = require('./analyze.js');
const en = require('./locales/en.js');
const { resolve } =  require('./resolve.js');
const { TextReporter } = require('./reporters/text_reporter.js');

const {
  DOCUMENT,
  EMPTY,
  FIELD,
  FIELDSET,
  FIELDSET_ENTRY,
  FIELD_OR_FIELDSET_OR_LIST,
  LIST,
  LIST_ITEM,
  MULTILINE_FIELD_BEGIN,
  PRETTY_TYPES,
  SECTION
} = require('./constants.js');

class Context {
  constructor(input, options) {
    this._input = input;
    this.messages = options.hasOwnProperty('locale') ? options.locale : en;
    this.reporter = options.hasOwnProperty('reporter') ? options.reporter : TextReporter;
    this.source = options.hasOwnProperty('source') ? options.source : null;

    this._analyze();

    if(this.hasOwnProperty('copy')) {
      this._resolve();
    }
  }

  // TODO: Here and elsewhere - don't manually copy over copied comments field in resolve.js
  //       but instead also derive a copied comment in here, lazily, just as in this.value() ?
  comment(element) {
    if(!element.hasOwnProperty('computedComment')) {
      if(element.hasOwnProperty('comments')) {
        if(element.comments.length === 1) {
          element.computedComment = element.comments[0].comment;
        } else {
          let firstNonEmptyLineIndex = null;
          let sharedIndent = Infinity;
          let lastNonEmptyLineIndex = null;

          for(const [index, comment] of element.comments.entries()) {
            if(comment.comment !== null) {
              if(firstNonEmptyLineIndex == null) {
                firstNonEmptyLineIndex = index;
              }

              const indent = comment.ranges.comment[0] - comment.ranges.line[0];
              if(indent < sharedIndent) {
                sharedIndent = indent;
              }

              lastNonEmptyLineIndex = index;
            }
          }

          if(firstNonEmptyLineIndex !== null) {
            const nonEmptyLines = element.comments.slice(
              firstNonEmptyLineIndex,
              lastNonEmptyLineIndex + 1
            );

            element.computedComment = nonEmptyLines.map(comment => {
              if(comment.comment === null) {
                return '';
              } else if(comment.ranges.comment[0] - comment.ranges.line[0] === sharedIndent) {
                return comment.comment;
              } else {
                return ' '.repeat(comment.ranges.comment[0] - comment.ranges.line[0] - sharedIndent) + comment.comment;
              }
            }).join('\n');
          } else {
            element.computedComment = null;
          }
        }
      } else {
        element.computedComment = null;
      }
    }

    return element.computedComment;
  }

  elements(section) {
    if(section.hasOwnProperty('mirror')) {
      return this.elements(section.mirror);
    } else {
      if(!section.hasOwnProperty('computedElements')) {
        section.computedElementsMap = {};
        section.computedElements = section.elements;

        for(const element of section.computedElements) {
          if(section.computedElementsMap.hasOwnProperty(element.key)) {
            section.computedElementsMap[element.key].push(element);
          } else {
            section.computedElementsMap[element.key] = [element];
          }
        }

        if(section.hasOwnProperty('extend')) {
          const copiedElements = this.elements(section.extend).filter(element =>
            !section.computedElementsMap.hasOwnProperty(element.key)
          );

          section.computedElements = copiedElements.concat(section.computedElements);  // TODO: .push(...xy) somehow possible too? (but careful about order, which is relevant)

          for(const element of copiedElements) {
            if(section.computedElementsMap.hasOwnProperty(element.key)) {
              section.computedElementsMap[element.key].push(element);
            } else {
              section.computedElementsMap[element.key] = [element];
            }
          }
        }
      }

      return section.computedElements;
    }
  }

  entries(fieldset) {
    if(fieldset.hasOwnProperty('mirror')) {
      return this.entries(fieldset.mirror);
    } else {
      if(!fieldset.hasOwnProperty('computedEntries')) {
        fieldset.computedEntriesMap = {};
        fieldset.computedEntries = fieldset.entries;

        for(const entry of fieldset.computedEntries) {
          if(fieldset.computedEntriesMap.hasOwnProperty(entry.key)) {
            fieldset.computedEntriesMap[entry.key].push(entry);
          } else {
            fieldset.computedEntriesMap[entry.key] = [entry];
          }
        }

        if(fieldset.hasOwnProperty('extend')) {
          const copiedEntries = this.entries(fieldset.extend).filter(entry =>
            !fieldset.computedEntriesMap.hasOwnProperty(entry.key)
          );

          fieldset.computedEntries = copiedEntries.concat(fieldset.computedEntries); // TODO: .push(...xy) somehow possible too? (but careful about order, which is relevant)

          for(const entry of copiedEntries) {
            if(fieldset.computedEntriesMap.hasOwnProperty(entry.key)) {
              fieldset.computedEntriesMap[entry.key].push(entry);
            } else {
              fieldset.computedEntriesMap[entry.key] = [entry];
            }
          }
        }
      }

      return fieldset.computedEntries;
    }
  }

  items(list) {
    if(list.hasOwnProperty('mirror')) {
      return this.items(list.mirror);
    } else if(!list.hasOwnProperty('extend')) {
      return list.items;
    } else {
      if(!list.hasOwnProperty('computedItems')) {
        list.computedItems = [...this.items(list.extend), ...list.items];
      }

      return list.computedItems;
    }
  }

  // TODO: raw() implies this would be the actual underlying structure used - maybe something like toNative or toJson is better (json would be good for interchangeable specs)
  raw(element) {
    const result = {
      type: PRETTY_TYPES[element.type]
    };

    if(element.hasOwnProperty('comments')) {
      result.comment = this.comment(element);
    }

    switch(element.type) {
      case FIELD_OR_FIELDSET_OR_LIST:  // fall through
      case EMPTY:
        result.key = element.key;
        break;
      case FIELD:
        result.key = element.key;
        result.value = this.value(element);
        break;
      case LIST_ITEM:
        result.value = this.value(element);
        break;
      case FIELDSET_ENTRY:
        result.key = element.key;
        result.value = this.value(element);
        break;
      case MULTILINE_FIELD_BEGIN:
        result.key = element.key;
        result.value = this.value(element);
        break;
      case LIST:
        result.key = element.key;
        result.items = this.items(element).map(item => this.raw(item))
        break;
      case FIELDSET:
        result.key = element.key;
        result.entries = this.entries(element).map(entry => this.raw(entry))
        break;
      case SECTION:
        result.key = element.key;
        // fall through
      case DOCUMENT:
        result.elements = this.elements(element).map(sectionElement => this.raw(sectionElement))
        break;
    }

    return result;
  }

  value(element) {
    if(!element.hasOwnProperty('computedValue')) {
      if(element.hasOwnProperty('mirror'))
        return this.value(element.mirror);

      element.computedValue = null;

      if(element.type === MULTILINE_FIELD_BEGIN) {
        if(element.lines.length > 0) {
          element.computedValue = this._input.substring(
            element.lines[0].ranges.line[0],
            element.lines[element.lines.length - 1].ranges.line[1]
          );
        }
      } else {
        if(element.hasOwnProperty('value')) {
          element.computedValue = element.value;  // TODO: *Could* consider not actually storing those, but lazily aquiring from substring as well (probably only makes sense in e.g. rust implementation though)
        }

        if(element.hasOwnProperty('continuations')) {
          let unappliedSpacing = false;

          for(let continuation of element.continuations) {
            if(element.computedValue === null) {
              element.computedValue = continuation.value;
              unappliedSpacing = false;
            } else if(continuation.value === null) {
              unappliedSpacing = unappliedSpacing || continuation.spaced;
            } else if(continuation.spaced || unappliedSpacing) {
              element.computedValue += ' ' + continuation.value;
              unappliedSpacing = false;
            } else {
              element.computedValue += continuation.value;
            }
          }
        }
      }
    }

    return element.computedValue;
  }
}

Context.prototype._analyze = analyze;
Context.prototype._resolve = resolve;

exports.Context = Context;

},{"./analyze.js":1,"./constants.js":2,"./locales/en.js":29,"./reporters/text_reporter.js":37,"./resolve.js":38}],4:[function(require,module,exports){
const fieldset_entry_module = require('./fieldset_entry.js');
const list_item_module = require('./list_item.js');

const { errors } = require('../errors/validation.js');
const { DOCUMENT, FIELDSET_ENTRY, LIST_ITEM } = require('../constants.js');
const { SectionElement } = require('./section_element.js');

// TODO: parent() implementation on Element and SectionElement ?

class Element extends SectionElement {
  toDocument() {
    if(this._instruction.type !== DOCUMENT)
      throw errors.unexpectedElementType(this._context, null, this._instruction, 'expectedDocument');

    if(!this._section) {
      this._section = new section_module.Section(this._context, this._instruction); // TODO: parent missing? or: what if casting Element to Field (inherited from SectionElement) but does not have parent because originating from lookup? investigate
      this._yielded = SECTION;
    }

    return this._section;
  }

  toFieldsetEntry() {
    if(!this._fieldsetEntry) {
      if(this._instruction.type !== FIELDSET_ENTRY)
        throw errors.unexpectedElementType(this._context, null, this._instruction, 'expectedFieldsetEntry');

      this._fieldsetEntry = new fieldset_entry_module.Fieldset(this._context, this._instruction); // TODO: parent missing? or: what if casting Element to Field (inherited from SectionElement) but does not have parent because originating from lookup? investigate
    }

    return this._fieldsetEntry;
  }

  toListItem() {
    if(!this._listItem) {
      if(this._instruction.type !== LIST_ITEM)
        throw errors.unexpectedElementType(this._context, null, this._instruction, 'expectedListItem');

      this._listItem = new list_item_module.ListItem(this._context, this._instruction); // TODO: parent missing? or: what if casting Element to Field (inherited from SectionElement) but does not have parent because originating from lookup? investigate
    }

    return this._listItem;
  }

  toSection() {
    if(!this._section) {
      if(this._instruction.type !== SECTION && this._instruction.type !== DOCUMENT)
        throw errors.unexpectedElementType(this._context, null, this._instruction, 'expectedSection');

      this._section = new section_module.Section(this._context, this._instruction); // TODO: parent missing? or: what if casting Element to Field (inherited from SectionElement) but does not have parent because originating from lookup? investigate
      this._yielded = SECTION;
    }

    return this._section;
  }

  /**
   * Returns a debug representation of this {@link Element} in the form of `[object Element key=foo yields=field]`.
   *
   * @return {string} A debug representation of this {@link Element}.
   */
  toString() {
    return `[object Element key=${this._key()} yields=${this._yields()}]`;
  }

  yieldsDocument() {
    return this._instruction.type === DOCUMENT;
  }

  yieldsFieldsetEntry() {
    return this._instruction.type === FIELDSET_ENTRY;
  }

  yieldsListItem() {
    return this._instruction.type === LIST_ITEM;
  }

  yieldsSection() {
    return this._instruction.type === SECTION ||
           this._instruction.type === DOCUMENT;
  }
}

exports.Element = Element;

},{"../constants.js":2,"../errors/validation.js":27,"./fieldset_entry.js":9,"./list_item.js":11,"./section_element.js":22}],5:[function(require,module,exports){
const { errors } = require('../errors/validation.js');
const { DOCUMENT, LIST_ITEM } = require('../constants.js');

class ElementBase {
  constructor(context, instruction, parent = null) {
    this._context = context;
    this._instruction = instruction;
    this._parent = parent;
  }

  _comment(loader, required) {
    this._touched = true;

    const comment = this._context.comment(this._instruction);

    if(comment === null) {
      if(required)
        throw errors.missingComment(this._context, this._instruction);

      return null;
    }

    if(loader === null)
      return comment;

    try {
      return loader(comment);
    } catch(message) {
      throw errors.commentError(this._context, message, this._instruction);
    }
  }

  _key() {
    switch(this._instruction.type) {
      case DOCUMENT: return null;
      case LIST_ITEM: return this._instruction.parent.key;
      default: return this._instruction.key;
    }
  }

  /**
   * Constructs and returns a {@link ValidationError} with the supplied message in the context of this element's comment.
   *
   * Note that this only *returns* an error, whether you want to just use its
   * metadata, pass it on or actually throw the error is up to you.
   *
   * @param {string|function(comment: string): string} message A message or a function that receives the element's comment and returns the message.
   * @return {ValidationError} The requested error.
   */
  commentError(message) {
    return errors.commentError(
      this._context,
      typeof message === 'function' ? message(this._context.comment(this._instruction)) : message,
      this._instruction
    );
  }

  /**
   * Constructs and returns a {@link ValidationError} with the supplied message in the context of this element.
   *
   * Note that this only *returns* an error, whether you want to just use its
   * metadata, pass it on or actually throw the error is up to you.
   *
   * @param {string|function(element: Element): string} message A message or a function that receives the element and returns the message.
   * @return {ValidationError} The requested error.
   */
  error(message) {
    return errors.elementError(
      this._context,
      typeof message === 'function' ? message(this) : message,  // TODO: *this* is problematic in this context - what is it?
      this._instruction
    );
  }

  /**
   * Passes the key of this {@link Element} through the provided loader, returns the result and touches the element.
   * Throws a {@link ValidationError} if an error is intercepted from the loader.
   *
   * @example
   * // Given a field with the key 'foo' ...
   *
   * field.key(key => key.toUpperCase()); // returns 'FOO'
   * field.key(key => { throw 'You shall not pass!'; }); // throws an error based on the intercepted error message
   *
   * @param {function(key: string): any} loader A loader function taking the key as a `string` and returning any other type or throwing a `string` message.
   * @return {any} The result of applying the provided loader to this {@link Element}'s key.
   * @throws {ValidationError} Thrown when an error from the loader is intercepted.
   */
  key(loader) {
    this._touched = true;

    try {
      return loader(this._key());
    } catch(message) {
      throw errors.keyError(this._context, message, this._instruction);
    }
  }

  /**
   * Constructs and returns a {@link ValidationError} with the supplied message in the context of this element's key.
   *
   * Note that this only *returns* an error, whether you want to just use its
   * metadata, pass it on or actually throw the error is up to you.
   *
   * @param {string|function(key: string): string} message A message or a function that receives the element's key and returns the message.
   * @return {ValidationError} The requested error.
   */
  keyError(message) {
    return errors.keyError(
      this._context,
      typeof message === 'function' ? message(this._key()) : message,
      this._instruction
    );
  }

  /**
   * Passes the associated comment of this {@link Element} through the provided loader, returns the result and touches the element.
   * The loader is only invoked if there is an associated comment, otherwise `null` is returned directly.
   * Throws a {@link ValidationError} if an error is intercepted from the loader.
   *
   * @example
   * // Given a field with an associated comment 'foo' ...
   *
   * field.optionalComment(comment => comment.toUpperCase()); // returns 'FOO'
   * field.optionalComment(comment => { throw 'You shall not pass!'; }); // throws an error based on the intercepted error message
   *
   * // Given a field with no associated comment ...
   *
   * field.optionalComment(comment => comment.toUpperCase()); // returns null
   * field.optionalComment(comment => { throw 'You shall not pass!'; }); // returns null
   *
   * @param {function(value: string): any} loader A loader function taking the comment as `string` and returning any other type or throwing a `string` message.
   * @return {?any} The result of applying the provided loader to this {@link Element}'s comment, or `null` when none exists.
   * @throws {ValidationError} Thrown when an error from the loader is intercepted.
   */
  optionalComment(loader) {
    return this._comment(loader, false);
  }

  /**
   * Returns the associated comment of this {@link Element} as a `string` and touches the element.
   * Returns `null` if there is no associated comment.
   *
   * @return {?string} The associated comment of this {@link Element} as a `string`, or `null`.
   */
  optionalStringComment() {
    return this._comment(null, false);
  }

  /**
   * TODO: Adapt this documentation for the new generic one fits all implementation on Element
   *
   * For fields and fieldset entries returns an `object` of the form `{ key: 'value' }`, for list items returns the value as a `string` or null when empty.
   *
   * @return {object|string|null} The value of this {@link Field} as a `string` or the whole element represented as an `object`.
   */
  raw() {
    return this._context.raw(this._instruction);
  }

  /**
   * Passes the associated comment of this {@link Element} through the provided loader, returns the result and touches the element.
   * The loader is only invoked if there is an associated comment, otherwise a {@link ValidationError} is thrown directly.
   * Also throws a {@link ValidationError} if an error is intercepted from the loader.
   *
   * @example
   * // Given a field with an associated comment 'foo' ...
   *
   * field.requiredComment(comment => comment.toUpperCase()); // returns 'FOO'
   * field.requiredComment(comment => { throw 'You shall not pass!'; }); // throws an error based on the intercepted error message
   *
   * // Given a field with no associated comment ...
   *
   * field.requiredComment(comment => comment.toUpperCase()); // throws an error stating that a required comment is missing
   * field.requiredComment(comment => { throw 'You shall not pass!'; }); // throws an error stating that a required comment is missing
   *
   * @param {function(value: string): any} loader A loader function taking the comment as `string` and returning any other type or throwing a `string` message.
   * @return {any} The result of applying the provided loader to this {@link Element}'s comment.
   * @throws {ValidationError} Thrown when there is no associated comment or an error from the loader is intercepted.
   */
  requiredComment(loader) {
    return this._comment(loader, true);
  }

  /**
   * Returns the associated comment of this {@link Element} as a `string` and touches the element.
   * Throws a {@link ValidationError} if there is no associated comment.
   *
   * @return {string} The associated comment of this {@link Element} as a `string`.
   * @throws {ValidationError} Thrown when there is no associated comment.
   */
  requiredStringComment() {
    return this._comment(null, true);
  }

  /**
   * Returns the key of this {@link Element} as a `string` and touches the element.
   *
   * @return {string} The key of this {@link Element} as a `string`.
   */
  stringKey() {
    this._touched = true;

    return this._key();
  }

  /**
   * Touches this {@link Element} and all elements below it.
   */
  touch() {
    this._touched = true;
  }
}

exports.ElementBase = ElementBase;

},{"../constants.js":2,"../errors/validation.js":27}],6:[function(require,module,exports){
const { ElementBase } = require('./element_base.js');
const section_module = require('./section.js');

class Empty extends ElementBase {
  get [Symbol.toStringTag]() {
    return 'Empty';
  }

  parent() {
    return this._parent || new section_module.Section(this._context, this._instruction.parent);
  }

  /**
   * Returns a debug representation of this {@link Empty} in the form of `[object Empty key=foo]`.
   *
   * @return {string} A debug representation of this {@link Empty}.
   */
  toString() {
    return `[object Empty key=${this._instruction.key}]`;
  }
}

exports.Empty = Empty;

},{"./element_base.js":5,"./section.js":21}],7:[function(require,module,exports){
const section_module = require('./section.js');

const { errors } = require('../errors/validation.js');
const { ValueElementBase } = require('./value_element_base.js');

class Field extends ValueElementBase {
  get [Symbol.toStringTag]() {
    return 'Field';
  }

  _value(loader, required) {
    this._touched = true;

    const value = this._context.value(this._instruction);

    if(value === null) {
      if(required)
        throw errors.missingValue(this._context, this._instruction);

      return null;
    }

    if(!loader)
      return value;

    try {
      return loader(value);
    } catch(message) {
      throw errors.valueError(this._context, message, this._instruction);
    }
  }

  /**
   * Returns the value of this {@link Field} as a `string` and touches the element.
   * Returns `null` if there is no value.
   *
   * @return {?string} The value of this {@link Field} as a `string`, or `null`.
   */
  optionalStringValue() {
    return this._value(null, false);
  }

  /**
   * Passes the value of this {@link Field} through the provided loader, returns the result and touches the element.
   * The loader is only invoked if there is a value, otherwise `null` is returned directly.
   * Throws a {@link ValidationError} if an error is intercepted from the loader.
   *
   * @example
   * // Given a field containing the value 'foo' ...
   *
   * field.optionalValue(value => value.toUpperCase()); // returns 'FOO'
   * field.optionalValue(value => { throw 'You shall not pass!'; }); // throws an error based on the intercepted error message
   *
   * // Given a field containing no value ...
   *
   * field.optionalValue(value => value.toUpperCase()); // returns null
   * field.optionalValue(value => { throw 'You shall not pass!'; }); // returns null
   *
   * @param {function(value: string): any} loader A loader function taking a `string` value and returning any other type or throwing a `string` message.
   * @return {?any} The result of applying the provided loader to this {@link Field}'s value, or `null` when empty.
   * @throws {ValidationError} Thrown when an error from the loader is intercepted.
   */
  optionalValue(loader) {
    return this._value(loader, false);
  }

  /**
   * Returns the parent instance, either a {@link Fieldset}, {@link List} or {@link Section}.
   *
   * @return {Fieldset|List|Section} The parent element instance.
   */
  parent() {
    return this._parent || new section_module.Section(this._context, this._instruction.parent);
  }

  /**
   * Returns the value of this {@link Field} as a `string` and touches the element.
   * Throws a {@link ValidationError} if there is no value.
   *
   * @return {string} The value of this {@link Field} as a `string`.
   * @throws {ValidationError} Thrown when there is no value.
   */
  requiredStringValue() {
    return this._value(null, true);
  }

  /**
   * Passes the value of this {@link Field} through the provided loader, returns the result and touches the element.
   * The loader is only invoked if there is a value, otherwise a {@link ValidationError} is thrown directly.
   * Also throws a {@link ValidationError} if an error is intercepted from the loader.
   *
   * @example
   * // Given a field containing the value 'foo' ...
   *
   * field.requiredValue(value => value.toUpperCase()); // returns 'FOO'
   * field.requiredValue(value => { throw 'You shall not pass!'; }); // throws an error based on the intercepted error message
   *
   * // Given a field containing no value ...
   *
   * field.requiredValue(value => value.toUpperCase()); // throws an error stating that a required value is missing
   * field.requiredValue(value => { throw 'You shall not pass!'; }); // throws an error stating that a required value is missing
   *
   * @param {function(value: string): any} loader A loader function taking a `string` value and returning any other type or throwing a `string` message.
   * @return {any} The result of applying the provided loader to this {@link Field}'s value.
   * @throws {ValidationError} Thrown when there is no value or an error from the loader is intercepted.
   */
  requiredValue(loader) {
    return this._value(loader, true);
  }

  /**
   * Returns a debug representation of this {@link Field} in the form of `[object Field key=foo value=bar]`.
   *
   * @return {string} A debug representation of this {@link Field}.
   */
  toString() {
    return `[object Field key=${this._instruction.key} value=${this._printValue()}]`;
  }
}

exports.Field = Field;

},{"../errors/validation.js":27,"./section.js":21,"./value_element_base.js":23}],8:[function(require,module,exports){
const fieldset_entry_module = require('./fieldset_entry.js');
const section_module = require('./section.js');
const missing_fieldset_entry_module = require('./missing/missing_fieldset_entry.js');

const { ElementBase } = require('./element_base.js');
const { errors } = require('../errors/validation.js');

class Fieldset extends ElementBase {
  constructor(context, instruction, parent = null) {
    super(context, instruction, parent);

    this._allEntriesRequired = parent ? parent._allElementsRequired : false;
  }

  get [Symbol.toStringTag]() {
    return 'Fieldset';
  }

  _entries(map = false) {
    if(!this.hasOwnProperty('_instantiatedEntries')) {
      this._instantiatedEntries = [];
      this._instantiatedEntriesMap = {};
      this._instantiateEntries(this._instruction);
    }

    return map ? this._instantiatedEntriesMap : this._instantiatedEntries;
  }

  _entry(key, required = null) {
    this._touched = true;

    let entries;
    if(key === null) {
      entries = this._entries();
    } else {
      const entriesMap = this._entries(true);
      entries = entriesMap.hasOwnProperty(key) ? entriesMap[key] : [];
    }

    if(entries.length === 0) {
      if(required || required === null && this._allEntriesRequired) {
        throw errors.missingElement(this._context, key, this._instruction, 'missingFieldsetEntry');
      } else if(required === null) {
        return new missing_fieldset_entry_module.MissingFieldsetEntry(key, this);
      } else {
        return null;
      }
    }

    if(entries.length > 1)
      throw errors.unexpectedMultipleElements(
        this._context,
        key,
        entries.map(entry => entry._instruction),
        'expectedSingleFieldsetEntry'
      );

    return entries[0];
  }

  _instantiateEntries(fieldset) {
    if(fieldset.hasOwnProperty('mirror')) {
      this._instantiateEntries(fieldset.mirror);
    } else if(fieldset.hasOwnProperty('entries')) {
      const nativeEntries = fieldset.entries.filter(entry =>
        !this._instantiatedEntriesMap.hasOwnProperty(entry.key)
      ).map(entry => {
        const instance = new fieldset_entry_module.FieldsetEntry(this._context, entry, this);

        if(this._instantiatedEntriesMap.hasOwnProperty(entry.key)) {
          this._instantiatedEntriesMap[entry.key].push(instance);
        } else {
          this._instantiatedEntriesMap[entry.key] = [instance];
        }

        return instance;
      });

      if(fieldset.hasOwnProperty('extend')) {
        this._instantiateEntries(fieldset.extend);
      }

      this._instantiatedEntries.push(...nativeEntries);
    }
  }

  _missingError(entry) {
    throw errors.missingElement(this._context, entry._key, this._instruction, 'missingFieldsetEntry');
  }

  _untouched() {
    if(!this._touched)
      return this._instruction;

    const untouchedEntry = this._entries().find(entry => !entry._touched);

    return untouchedEntry ? untouchedEntry._instruction : false;
  }

  allEntriesRequired(required = true) {
    this._allEntriesRequired = required;
  }

  /**
   * Assert that all entries inside this fieldset have been touched
   * @param {string} message A static string error message or a message function taking the excess element and returning an error string
   * @param {object} options
   * @param {array} options.except An array of entry keys to exclude from assertion
   * @param {array} options.only Specifies to ignore all entries but the ones includes in this array of element keys
   */
  assertAllTouched(...optional) {
    let message = null;
    let options = {};

    for(const argument of optional) {
      if(typeof argument === 'object') {
        options = argument;
      } else {
        message = argument
      }
    }

    const entriesMap = this._entries(true);

    for(const [key, entries] of Object.entries(entriesMap)) {
      if(options.hasOwnProperty('except') && options.except.includes(key)) continue;
      if(options.hasOwnProperty('only') && !options.only.includes(key)) continue;

      for(const entry of entries) {
        if(!entry.hasOwnProperty('_touched')) {
          if(typeof message === 'function') {
            message = message(entry);  // TODO: This passes a FieldsetEntry while in section.assertAllTouched passes Element? Inconsisten probably
          }

          throw errors.unexpectedElement(this._context, message, entry._instruction); // TODO: Consider all error implementations fetching the _instruction themselves?
        }
      }
    }
  }

  /**
   * Returns the entries of this {@link Fieldset} as an array in the original document order.
   *
   * @param {string} [key] If provided only entries with the specified key are returned.
   * @return {Field[]} The entries of this {@link Fieldset}.
   */
  entries(key = null) {
    this._touched = true;

    if(key === null) {
      return this._entries();
    } else {
      const entriesMap = this._entries(true);

      if(!entriesMap.hasOwnProperty(key))
        return [];

      return entriesMap[key];
    }
  }

  /**
   * Returns the entry with the specified `key`.
   *
   * @param {string} [key] The key of the entry to return. Can be left out to validate and query a single entry with an arbitrary key.
   * @return {Field|MissingField} The entry with the specified key, if available, or a {@link MissingField} proxy instance.
   */
  entry(key = null) {
    return this._entry(key);
  }

  optionalEntry(key = null) {
    return this._entry(key, false);
  }

  /**
   * Returns the parent {@link Section}.
   *
   * @return {Section} The parent section.
   */
  parent() {
    return this._parent || new section_module.Section(this._context, this._instruction.parent);
  }

  requiredEntry(key = null) {
    return this._entry(key, true);
  }

  /**
   * Returns a debug representation of this {@link Fieldset} in the form of `[object Fieldset key=foo entries=2]`.
   *
   * @return {string} A debug representation of this {@link Fieldset}.
   */
  toString() {
    return `[object Fieldset key=${this._instruction.key} entries=${this._entries().length}]`;
  }

  touch() {
    // TODO: Potentially revisit this - maybe we can do a shallow touch, that is: propagating only to the hierarchy below that was already instantiated,
    //       while marking the deepest initialized element as _touchedRecursive/Deeply or something, which marks a border for _untouched() checks that
    //       does not have to be traversed deeper down. However if after that the hierarchy is used after all, the _touched property should be picked
    //       up starting at the element marked _touchedRecursive, passing the property down below.

    this._touched = true;

    for(const entry of this.entries()) {
      entry._touched = true;
    }
  }
}

exports.Fieldset = Fieldset;

},{"../errors/validation.js":27,"./element_base.js":5,"./fieldset_entry.js":9,"./missing/missing_fieldset_entry.js":16,"./section.js":21}],9:[function(require,module,exports){
const fieldset_module = require('./fieldset.js');
const { ValueElementBase } = require('./value_element_base.js');

class FieldsetEntry extends ValueElementBase {
  get [Symbol.toStringTag]() {
    return 'FieldsetEntry';
  }

  parent() {
    return this._parent || new fieldset_module.Fieldset(this._context, this._instruction.parent);
  }

  toString() {
    return `[object FieldsetEntry key=${this._instruction.key} value=${this._printValue()}]`;
  }
}

exports.FieldsetEntry = FieldsetEntry;

},{"./fieldset.js":8,"./value_element_base.js":23}],10:[function(require,module,exports){
const list_item_module = require('./list_item.js');
const section_module = require('./section.js');
const { ElementBase } = require('./element_base.js');

class List extends ElementBase {
  get [Symbol.toStringTag]() {
    return 'List';
  }

  _instantiateItems(list) {
    if(list.hasOwnProperty('mirror')) {
      return this._instantiateItems(list.mirror);
    } else if(list.hasOwnProperty('extend')) {
      return [
        ...this._instantiateItems(list.extend),
        ...list.items.map(item => new list_item_module.ListItem(this._context, item, this))
      ];
    } else if(list.hasOwnProperty('items')) {
      return list.items.map(item => new list_item_module.ListItem(this._context, item, this));
    } else {
      return [];
    }
  }

  _items() {
    if(!this.hasOwnProperty('_instantiatedItems')) {
      this._instantiatedItems = this._instantiateItems(this._instruction);
    }

    return this._instantiatedItems;
  }

  _untouched() {
    if(!this._touched)
      return this._instruction;

    const untouchedItem = this._items().find(item => !item._touched);

    return untouchedItem ? untouchedItem._instruction : false;
  }

  /**
   * Returns the items in this {@link List} as an array.
   *
   * @return {Field[]} The items in this {@link List}.
   */
  items() {
    this._touched = true;

    return this._items();
  }

  /**
   * Returns the number of items in this {@link List} as a `number`.
   *
   * @return {number} The number of items in this {@link List}.
   */
  length() {
    this._touched = true;

    return this._items().length;
  }

  optionalStringValues() {
    this._touched = true;

    return this._items().map(item => item.optionalStringValue());
  }

  optionalValues(loader) {
    this._touched = true;

    return this._items().map(item => item.optionalValue(loader));
  }

  /**
   * Returns the parent {@link Section}.
   *
   * @return {Section} The parent section.
   */
  parent() {
    return this._parent || new section_module.Section(this._context, this._instruction.parent);
  }

  requiredStringValues() {
    this._touched = true;

    return this._items().map(item => item.requiredStringValue());
  }

  requiredValues(loader) {
    this._touched = true;

    return this._items().map(item => item.requiredValue(loader));
  }

  /**
   * Returns a debug representation of this {@link List} in the form of `[object List key=foo items=2]`.
   *
   * @return {string} A debug representation of this {@link List}.
   */
  toString() {
    return `[object List key=${this._instruction.key} items=${this._items().length}]`;
  }

  touch() {
    this._touched = true;

    for(const item of this.items()) {
      item._touched = true;
    }
  }
}

exports.List = List;

},{"./element_base.js":5,"./list_item.js":11,"./section.js":21}],11:[function(require,module,exports){
const list_module = require('./list.js');

const { ValueElementBase } = require('./value_element_base.js');

class ListItem extends ValueElementBase {
  get [Symbol.toStringTag]() {
    return 'ListItem';
  }

  parent() {
    return this._parent || new list_module.List(this._context, this._instruction.parent);
  }

  toString() {
    return `[object ListItem value=${this._printValue()}]`;
  }
}

exports.ListItem = ListItem;

},{"./list.js":10,"./value_element_base.js":23}],12:[function(require,module,exports){
class MissingElementBase {
  constructor(key, parent) {
    this._key = key;
    this._parent = parent;
  }

  _missingError(_element) {
    this._parent._missingError(this);
  }

  key(_loader) {
    this._parent._missingError(this);
  }

  optionalComment(_loader) {
    return null;
  }

  optionalStringComment() {
    return null;
  }

  // TODO: I think this I wanted to remove here and elsewhere and re-implement as internal helper for specs?
  raw() {
    return null;
  }

  requiredComment(_loader) {
    this._parent._missingError(this);
  }

  requiredStringComment() {
    this._parent._missingError(this);
  }

  stringKey() {
    this._parent._missingError(this);
  }
}

exports.MissingElementBase = MissingElementBase;

},{}],13:[function(require,module,exports){
const { MissingElementBase } = require('./missing_element_base.js');

class MissingEmpty extends MissingElementBase {
  get [Symbol.toStringTag]() {
    return 'MissingEmpty';
  }

  toString() {
    if(this._key === null)
      return `[object MissingEmpty]`;

    return `[object MissingEmpty key=${this._key}]`;
  }
}

exports.MissingEmpty = MissingEmpty;

},{"./missing_element_base.js":12}],14:[function(require,module,exports){
const { MissingValueElementBase } = require('./missing_value_element_base.js');

class MissingField extends MissingValueElementBase {
  get [Symbol.toStringTag]() {
    return 'MissingField';
  }

  toString() {
    if(this._key === null)
      return `[object MissingField]`;

    return `[object MissingField key=${this._key}]`;
  }
}

exports.MissingField = MissingField;

},{"./missing_value_element_base.js":20}],15:[function(require,module,exports){
const missing_fieldset_entry_module = require('./missing_fieldset_entry.js');

const { MissingElementBase } = require('./missing_element_base.js');

class MissingFieldset extends MissingElementBase {
  get [Symbol.toStringTag]() {
    return 'MissingFieldset';
  }

  entries(_key = null) {
    return [];
  }

  entry(key = null) {
    return new missing_fieldset_entry_module.MissingFieldsetEntry(key, this);
  }

  optionalEntry(_key = null) {
    return null;
  }

  requiredEntry(_key = null) {
    this._parent._missingError(this);
  }

  toString() {
    if(this._key === null)
      return `[object MissingFieldset]`;

    return `[object MissingFieldset key=${this._key}]`;
  }
}

exports.MissingFieldset = MissingFieldset;

},{"./missing_element_base.js":12,"./missing_fieldset_entry.js":16}],16:[function(require,module,exports){
const { MissingValueElementBase } = require('./missing_value_element_base.js');

class MissingFieldsetEntry extends MissingValueElementBase {
  get [Symbol.toStringTag]() {
    return 'MissingFieldsetEntry';
  }

  toString() {
    if(this._key === null)
      return `[object MissingFieldsetEntry]`;

    return `[object MissingFieldsetEntry key=${this._key}]`;
  }
}

exports.MissingFieldsetEntry = MissingFieldsetEntry;

},{"./missing_value_element_base.js":20}],17:[function(require,module,exports){
const { MissingElementBase } = require('./missing_element_base.js');

class MissingList extends MissingElementBase {
  get [Symbol.toStringTag]() {
    return 'MissingList';
  }

  items() {
    return [];
  }

  optionalStringValues() {
    return [];
  }

  optionalValues(_loader) {
    return [];
  }

  requiredStringValues() {
    return [];
  }

  requiredValues(_loader) {
    return [];
  }

  toString() {
    if(this._key === null)
      return `[object MissingList]`;

    return `[object MissingList key=${this._key}]`;
  }
}

exports.MissingList = MissingList;

},{"./missing_element_base.js":12}],18:[function(require,module,exports){
const missing_empty_module = require('./missing_empty.js');
const missing_field_module = require('./missing_field.js');
const missing_fieldset_module = require('./missing_fieldset.js');
const missing_list_module = require('./missing_list.js');
const missing_section_element_module = require('./missing_section_element.js');

const { MissingElementBase } = require('./missing_element_base.js');

class MissingSection extends MissingElementBase {
  get [Symbol.toStringTag]() {
    return 'MissingSection';
  }

  empty(key = null) {
    return new missing_empty_module.MissingEmpty(key, this);
  }

  element(key = null) {
    return new missing_section_element_module.MissingSectionElement(key, this);
  }

  elements(_key = null) {
    return [];
  }

  field(key = null) {
    return new missing_field_module.MissingField(key, this);
  }

  fields(_key = null) {
    return [];
  }

  fieldset(key = null) {
    return new missing_fieldset_module.MissingFieldset(key, this);
  }

  fieldsets(_key = null) {
    return [];
  }

  list(key = null) {
    return new missing_list_module.MissingList(key, this);
  }

  lists(_key = null) {
    return [];
  }

  optionalElement(_key = null) {
    return null;
  }

  optionalEmpty(_key = null) {
    return null;
  }

  optionalField(_key = null) {
    return null;
  }

  optionalFieldset(_key = null) {
    return null;
  }

  optionalList(_key = null) {
    return null;
  }

  optionalSection(_key = null) {
    return null;
  }

  requiredElement(_key = null) {
    this._parent._missingError(this);
  }

  requiredEmpty(_key = null) {
    this._parent._missingError(this);
  }

  requiredField(_key = null) {
    this._parent._missingError(this);
  }

  requiredFieldset(_key = null) {
    this._parent._missingError(this);
  }

  requiredList(_key = null) {
    this._parent._missingError(this);
  }

  requiredSection(_key = null) {
    this._parent._missingError(this);
  }

  section(key = null) {
    return new MissingSection(key, this);
  }

  sections(_key = null) {
    return [];
  }

  toString() {
    if(this._key === null)
      return `[object MissingSection]`;

    return `[object MissingSection key=${this._key}]`;
  }
}

exports.MissingSection = MissingSection;

},{"./missing_element_base.js":12,"./missing_empty.js":13,"./missing_field.js":14,"./missing_fieldset.js":15,"./missing_list.js":17,"./missing_section_element.js":19}],19:[function(require,module,exports){
const missing_empty_module = require('./missing_empty.js');
const missing_field_module = require('./missing_field.js');
const missing_fieldset_module = require('./missing_fieldset.js');
const missing_list_module = require('./missing_list.js');
const missing_section_module = require('./missing_section.js');

const { MissingElementBase } = require('./missing_element_base.js');

class MissingSectionElement extends MissingElementBase {
  get [Symbol.toStringTag]() {
    return 'MissingSectionElement';
  }

  toEmpty() {
    return new missing_empty_module.MissingEmpty(this._key, this._parent);
  }

  toField() {
    return new missing_field_module.MissingField(this._key, this._parent);
  }

  toFieldset() {
    return new missing_fieldset_module.MissingFieldset(this._key, this._parent);
  }

  toList() {
    return new missing_list_module.MissingList(this._key, this._parent);
  }

  toSection() {
    return new missing_section_module.MissingSection(this._key, this._parent);
  }

  toString() {
    if(this._key === null)
      return `[object MissingSectionElement]`;

    return `[object MissingSectionElement key=${this._key}]`;
  }

  yieldsEmpty() {
    return true; // TODO: Throw instead?!
  }

  yieldsField() {
    return true; // TODO: Throw instead?!
  }

  yieldsFieldset() {
    return true; // TODO: Throw instead?!
  }

  yieldsList() {
    return true; // TODO: Throw instead?!
  }

  yieldsSection() {
    return true; // TODO: Throw instead?!
  }
}

exports.MissingSectionElement = MissingSectionElement;

},{"./missing_element_base.js":12,"./missing_empty.js":13,"./missing_field.js":14,"./missing_fieldset.js":15,"./missing_list.js":17,"./missing_section.js":18}],20:[function(require,module,exports){
const { MissingElementBase } = require('./missing_element_base.js');

class MissingValueElementBase extends MissingElementBase {
  optionalStringValue() {
    return null;
  }

  optionalValue(_loader) {
    return null;
  }

  requiredStringValue() {
    this._parent._missingError(this);
  }

  requiredValue() {
    this._parent._missingError(this);
  }
}

exports.MissingValueElementBase = MissingValueElementBase;

},{"./missing_element_base.js":12}],21:[function(require,module,exports){
const element_module = require('./element.js');
const missing_empty_module = require('./missing/missing_empty.js');
const missing_field_module = require('./missing/missing_field.js');
const missing_fieldset_module = require('./missing/missing_fieldset.js');
const missing_list_module = require('./missing/missing_list.js');
const missing_section_element_module = require('./missing/missing_section_element.js');
const missing_section_module = require('./missing/missing_section.js');
const section_element_module = require('./section_element.js');

// TODO: touch() on ambiguous and/or missing elements
const { errors } = require('../errors/validation.js');
const { ElementBase } = require('./element_base.js');

const {
  DOCUMENT,
  EMPTY,
  FIELD,
  FIELDSET,
  FIELD_OR_FIELDSET_OR_LIST,
  LIST,
  MULTILINE_FIELD_BEGIN,
  SECTION
} = require('../constants.js');

// TODO: For each value store the representational type as well ? (e.g. string may come from "- foo" or -- foo\nxxx\n-- foo) and use that for precise error messages?

// TODO: These things ->   case MULTILINE_FIELD_BEGIN: /* handled in FIELD below */
//       Maybe handle with a generic FIELD type and an additional .multiline flag on the instruction? (less queries but quite some restructuring)

class Section extends ElementBase {
  constructor(context, instruction, parent = null) {
    super(context, instruction, parent);

    this._allElementsRequired = parent ? parent._allElementsRequired : false;
  }

  get [Symbol.toStringTag]() {
    return 'Section';
  }

  _element(key, required = null) {
    this._touched = true;

    let elements;
    if(key === null) {
      elements = this._elements();
    } else {
      const elementsMap = this._elements(true);
      elements = elementsMap.hasOwnProperty(key) ? elementsMap[key] : [];
    }

    if(elements.length === 0) {
      if(required || required === null && this._allElementsRequired) {
        throw errors.missingElement(this._context, key, this._instruction, 'missingElement');
      } else if(required === null) {
        return new missing_section_element_module.MissingSectionElement(key, this);
      } else {
        return null;
      }
    }

    if(elements.length > 1)
      throw errors.unexpectedMultipleElements(
        this._context,
        key,
        elements.map(element => element._instruction),
        'expectedSingleElement'
      );

    return elements[0];
  }

  _elements(map = false) {
    if(!this.hasOwnProperty('_instantiatedElements')) {
      this._instantiatedElements = [];
      this._instantiatedElementsMap = {};
      this._instantiateElements(this._instruction);
    }

    return map ? this._instantiatedElementsMap : this._instantiatedElements;
  }

  _empty(key, required = null) {
    this._touched = true;

    let elements;
    if(key === null) {
      elements = this._elements();
    } else {
      const elementsMap = this._elements(true);
      elements = elementsMap.hasOwnProperty(key) ? elementsMap[key] : [];
    }

    if(elements.length === 0) {
      if(required || required === null && this._allElementsRequired) {
        throw errors.missingElement(this._context, key, this._instruction, 'missingEmpty');
      } else if(required === null) {
        return new missing_empty_module.MissingEmpty(key, this);
      } else {
        return null;
      }
    }

    if(elements.length > 1)
      throw errors.unexpectedMultipleElements(
        this._context,
        key,
        elements.map(element => element._instruction),
        'expectedSingleEmpty'
      );

    const element = elements[0];

    if(element._instruction.type !== EMPTY)
      throw errors.unexpectedElementType(this._context, key, element._instruction, 'expectedEmpty');

    return element.toEmpty();
  }

  _field(key, required = null) {
    this._touched = true;

    let elements;
    if(key === null) {
      elements = this._elements();
    } else {
      const elementsMap = this._elements(true);
      elements = elementsMap.hasOwnProperty(key) ? elementsMap[key] : [];
    }

    if(elements.length === 0) {
      if(required || required === null && this._allElementsRequired) {
        throw errors.missingElement(this._context, key, this._instruction, 'missingField');
      } else if(required === null) {
        return new missing_field_module.MissingField(key, this);
      } else {
        return null;
      }
    }

    if(elements.length > 1)
      throw errors.unexpectedMultipleElements(
        this._context,
        key,
        elements.map(element => element._instruction),
        'expectedSingleField'
      );

    const element = elements[0];

    // TODO: Here and elsewhere these multiple checks are repeated in toField/to* again,
    //       should be optimized e.g. by going through a private toField cast mechanism
    //       without redundant checks. (or reconsidering the whole concept of storing
    //       SectionElement instances by default in sections)
    if(element._instruction.type !== FIELD &&
       element._instruction.type !== MULTILINE_FIELD_BEGIN &&
       element._instruction.type !== FIELD_OR_FIELDSET_OR_LIST)
      throw errors.unexpectedElementType(this._context, key, element._instruction, 'expectedField');

    return element.toField();
  }

  _fieldset(key, required = null) {
    this._touched = true;

    let elements;
    if(key === null) {
      elements = this._elements();
    } else {
      const elementsMap = this._elements(true);
      elements = elementsMap.hasOwnProperty(key) ? elementsMap[key] : [];
    }

    if(elements.length === 0) {
      if(required || required === null && this._allElementsRequired) {
        throw errors.missingElement(this._context, key, this._instruction, 'missingFieldset');
      } else if(required === null) {
        return new missing_fieldset_module.MissingFieldset(key, this);
      } else {
        return null;
      }
    }

    if(elements.length > 1)
      throw errors.unexpectedMultipleElements(
        this._context,
        key,
        elements.map(element => element._instruction),
        'expectedSingleFieldset'
      );

    const element = elements[0];

    if(element._instruction.type !== FIELDSET && element._instruction.type !== FIELD_OR_FIELDSET_OR_LIST)
      throw errors.unexpectedElementType(this._context, key, element._instruction, 'expectedFieldset');

    return element.toFieldset();
  }

  _instantiateElements(section) {
    if(section.hasOwnProperty('mirror')) {
      this._instantiateElements(section.mirror);
    } else {
      this._instantiatedElements.push(
        ...section.elements.filter(element =>
          !this._instantiatedElementsMap.hasOwnProperty(element.key)
        ).map(element => {
          const instance = new section_element_module.SectionElement(this._context, element, this);

          if(this._instantiatedElementsMap.hasOwnProperty(element.key)) {
            this._instantiatedElementsMap[element.key].push(instance);
          } else {
            this._instantiatedElementsMap[element.key] = [instance];
          }

          return instance;
        })
      );

      if(section.hasOwnProperty('extend')) {
        this._instantiateElements(section.extend);
      }
    }
  }

  _list(key, required = null) {
    this._touched = true;

    let elements;
    if(key === null) {
      elements = this._elements();
    } else {
      const elementsMap = this._elements(true);
      elements = elementsMap.hasOwnProperty(key) ? elementsMap[key] : [];
    }

    if(elements.length === 0) {
      if(required || required === null && this._allElementsRequired) {
        throw errors.missingElement(this._context, key, this._instruction, 'missingList');
      } else if(required === null) {
        return new missing_list_module.MissingList(key, this);
      } else {
        return null;
      }
    }

    if(elements.length > 1)
      throw errors.unexpectedMultipleElements(
        this._context,
        key,
        elements.map(element => element._instruction),
        'expectedSingleList'
      );

    const element = elements[0];

    if(element._instruction.type !== LIST && element._instruction.type !== FIELD_OR_FIELDSET_OR_LIST)
      throw errors.unexpectedElementType(this._context, key, element._instruction, 'expectedList');

    return element.toList();
  }

  // TODO: Can probably be simplified again - e.g. pushed back into Missing* classes themselves - also check if MissingFieldsetEntry addition is made use of already
  _missingError(element) {
    if(element instanceof missing_field_module.MissingField) {
      throw errors.missingElement(this._context, element._key, this._instruction, 'missingField');
    } else if(element instanceof missing_fieldset_module.MissingFieldset) {
      throw errors.missingElement(this._context, element._key, this._instruction, 'missingFieldset');
    } else if(element instanceof missing_list_module.MissingList) {
      throw errors.missingElement(this._context, element._key, this._instruction, 'missingList');
    } else if(element instanceof missing_section_module.MissingSection) {
      throw errors.missingElement(this._context, element._key, this._instruction, 'missingSection');
    } else {
      throw errors.missingElement(this._context, element._key, this._instruction, 'missingElement');
    }
  }

  _section(key, required = null) {
    this._touched = true;

    let elements;
    if(key === null) {
      elements = this._elements();
    } else {
      const elementsMap = this._elements(true);
      elements = elementsMap.hasOwnProperty(key) ? elementsMap[key] : [];
    }

    if(elements.length === 0) {
      if(required || required === null && this._allElementsRequired) {
        throw errors.missingElement(this._context, key, this._instruction, 'missingSection');
      } else if(required === null) {
        return new missing_section_module.MissingSection(key, this);
      } else {
        return null;
      }
    }

    if(elements.length > 1)
      throw errors.unexpectedMultipleElements(
        this._context,
        key,
        elements.map(element => element._instruction),
        'expectedSingleSection'
      );

    const element = elements[0];

    if(element._instruction.type !== SECTION)
      throw errors.unexpectedElementType(this._context, key, element._instruction, 'expectedSection');

    return element.toSection();
  }

  _untouched() {
    if(!this._touched)
      return this._instruction;

    for(const element of this._elements()) {
      const untouchedElement = element._untouched();

      if(untouchedElement) return untouchedElement;
    }

    return false;
  }

  allElementsRequired(required = true) {
    this._allElementsRequired = required;

    for(const element of this._elements()) {
      if(element._instruction.type === SECTION && element._yielded) {
        element.toSection().allElementsRequired(required);
      } else if(element._instruction.type === FIELDSET && element._yielded) {
        element.toFieldset().allEntriesRequired(required);
      }
    }
  }

  // TODO: Revisit this method name (ensureAllTouched? ... etc.)
  /**
   * Assert that all elements inside this section/document have been touched
   * @param {string} message A static string error message or a message function taking the excess element and returning an error string
   * @param {object} options
   * @param {array} options.except An array of element keys to exclude from assertion
   * @param {array} options.only Specifies to ignore all elements but the ones includes in this array of element keys
   */
  assertAllTouched(...optional) {
    let message = null;
    let options = {};

    for(const argument of optional) {
      if(typeof argument === 'object') {
        options = argument;
      } else {
        message = argument
      }
    }

    const elementsMap = this._elements(true);

    for(const [key, elements] of Object.entries(elementsMap)) {
      if(options.hasOwnProperty('except') && options.except.includes(key)) continue;
      if(options.hasOwnProperty('only') && !options.only.includes(key)) continue;

      for(const element of elements) {
        const untouched = element._untouched();

        if(untouched) {
          if(typeof message === 'function') {
            // TODO: This doesn't make use of a possible cached Element, although, SectionElement would be unusable here anyway ...
            message = message(new element_module.Element(this._context, untouched, this));
          }

          throw errors.unexpectedElement(this._context, message, untouched);
        }
      }
    }
  }

  element(key = null) {
    return this._element(key);
  }

  /**
   * Returns the elements of this {@link Section} as an array in the original document order.
   *
   * @param {string} [key] If provided only elements with the specified key are returned.
   * @return {Element[]} The elements of this {@link Section}.
   */
  elements(key = null) {
    this._touched = true;

    if(key === null) {
      return this._elements();
    } else {
      const elementsMap = this._elements(true);
      return elementsMap.hasOwnProperty(key) ? elementsMap[key] : [];
    }
  }

  empty(key = null) {
    return this._empty(key);
  }

  // TODO: Here and in other implementations and in missing_section: empties(...) ?

  field(key = null) {
    return this._field(key);
  }

  fields(key = null) {
    this._touched = true;

    let elements;
    if(key === null) {
      elements = this._elements();
    } else {
      const elementsMap = this._elements(true);
      elements = elementsMap.hasOwnProperty(key) ? elementsMap[key] : [];
    }

    return elements.map(element => {
      if(element._instruction.type !== FIELD &&
         element._instruction.type !== MULTILINE_FIELD_BEGIN &&
         element._instruction.type !== FIELD_OR_FIELDSET_OR_LIST)
        throw errors.unexpectedElementType(this._context, key, element._instruction, 'expectedFields');

      return element.toField();
    });
  }

  fieldset(key = null) {
    return this._fieldset(key);
  }

  fieldsets(key = null) {
    this._touched = true;

    let elements;
    if(key === null) {
      elements = this._elements();
    } else {
      const elementsMap = this._elements(true);
      elements = elementsMap.hasOwnProperty(key) ? elementsMap[key] : [];
    }

    return elements.map(element => {
      if(element._instruction.type !== FIELDSET && element._instruction.type !== FIELD_OR_FIELDSET_OR_LIST)
        throw errors.unexpectedElementType(this._context, key, element._instruction, 'expectedFieldsets');

      return element.toFieldset();
    });
  }

  list(key = null) {
    return this._list(key);
  }

  lists(key = null) {
    this._touched = true;

    let elements;
    if(key === null) {
      elements = this._elements();
    } else {
      const elementsMap = this._elements(true);
      elements = elementsMap.hasOwnProperty(key) ? elementsMap[key] : [];
    }

    return elements.map(element => {
      if(element._instruction.type !== LIST && element._instruction.type !== FIELD_OR_FIELDSET_OR_LIST)
        throw errors.unexpectedElementType(this._context, key, element._instruction, 'expectedLists');

      return element.toList();
    });
  }

  optionalElement(key = null) {
    return this._element(key, false);
  }

  optionalEmpty(key = null) {
    return this._empty(key, false);
  }

  optionalField(key = null) {
    return this._field(key, false);
  }

  optionalFieldset(key = null) {
    return this._fieldset(key, false);
  }

  optionalList(key = null) {
    return this._list(key, false);
  }

  optionalSection(key = null) {
    return this._section(key, false);
  }

  /**
   * Returns the parent {@link Section} or null when called on the document.
   *
   * @return {?Section} The parent instance or null.
   */
  parent() {
    if(this._instruction.type === DOCUMENT)
      return null;

    return this._parent || new Section(this._context, this._instruction.parent);
  }

  requiredElement(key = null) {
    return this._element(key, true);
  }

  requiredEmpty(key = null) {
    return this._empty(key, true);
  }

  requiredField(key = null) {
    return this._field(key, true);
  }

  requiredFieldset(key = null) {
    return this._fieldset(key, true);
  }

  requiredList(key = null) {
    return this._list(key, true);
  }

  requiredSection(key = null) {
    return this._section(key, true);
  }

  section(key = null) {
    return this._section(key);
  }

  sections(key = null) {
    this._touched = true;

    let elements;
    if(key === null) {
      elements = this._elements();
    } else {
      const elementsMap = this._elements(true);
      elements = elementsMap.hasOwnProperty(key) ? elementsMap[key] : [];
    }

    return elements.map(element => {
      if(element._instruction.type !== SECTION)
        throw errors.unexpectedElementType(this._context, key, element._instruction, 'expectedSections');

      return element.toSection();
    });
  }

  /**
   * Returns a debug representation of this {@link Section} in the form of `[object Section key=foo elements=2]`, respectively `[object Section document elements=2]` for the document itself.
   *
   * @return {string} A debug representation of this {@link Section}.
   */
  toString() {
    if(this._instruction.type === DOCUMENT)
      return `[object Section document elements=${this._elements().length}]`;

    return `[object Section key=${this._instruction.key} elements=${this._elements().length}]`;
  }

  touch() {
    // TODO: Potentially revisit this - maybe we can do a shallow touch, that is: propagating only to the hierarchy below that was already instantiated,
    //       while marking the deepest initialized element as _touchedRecursive/Deeply or something, which marks a border for _untouched() checks that
    //       does not have to be traversed deeper down. However if after that the hierarchy is used after all, the _touched property should be picked
    //       up starting at the element marked _touchedRecursive, passing the property down below.

    this._touched = true;

    for(const element of this._elements()) {
      element.touch();
    }
  }
}

exports.Section = Section;

},{"../constants.js":2,"../errors/validation.js":27,"./element.js":4,"./element_base.js":5,"./missing/missing_empty.js":13,"./missing/missing_field.js":14,"./missing/missing_fieldset.js":15,"./missing/missing_list.js":17,"./missing/missing_section.js":18,"./missing/missing_section_element.js":19,"./section_element.js":22}],22:[function(require,module,exports){
const empty_module = require('./empty.js');
const field_module = require('./field.js');
const fieldset_module = require('./fieldset.js');
const list_module = require('./list.js');
const section_module = require('./section.js');

const { ElementBase } = require('./element_base.js');
const { errors } = require('../errors/validation.js');

const {
  EMPTY,
  FIELD,
  FIELDSET,
  FIELD_OR_FIELDSET_OR_LIST,
  LIST,
  MULTILINE_FIELD_BEGIN,
  PRETTY_TYPES,
  SECTION
} = require('../constants.js');

// TODO: If this SectionElement gets touched (this._touched = true;),
//       the touched flag needs to be propagated down the hierarchy
//       when toSomething() is called to typecast the SectionElement.
//       I.e. the constructors for Field/Fieldset/etc. need to accept
//       this extra init parameter probably and it has to be passed
//       on lazily all the way down to the terminal leaves of the tree.
//       (applies to all implementations)

class SectionElement extends ElementBase {
  _untouched() {
    if(!this.hasOwnProperty('_yielded') && !this.hasOwnProperty('_touched'))
      return this._instruction;
    if(this.hasOwnProperty('_empty') && !this._empty.hasOwnProperty('_touched'))
      return this._instruction;
    if(this.hasOwnProperty('_field') && !this._field.hasOwnProperty('_touched'))
      return this._instruction;
    if(this.hasOwnProperty('_fieldset'))
      return this._fieldset._untouched();
    if(this.hasOwnProperty('_list'))
      return this._list._untouched();
    if(this.hasOwnProperty('_section'))
      return this._section._untouched();
  }

  _yields() {
    if(this._instruction.type === FIELD_OR_FIELDSET_OR_LIST)
      return `${PRETTY_TYPES[FIELD]},${PRETTY_TYPES[FIELDSET]},${PRETTY_TYPES[LIST]}`;

    return PRETTY_TYPES[this._instruction.type];
  }

  toEmpty() {
    if(!this.hasOwnProperty('_empty')) {
      if(this._instruction.type !== EMPTY)
        throw errors.unexpectedElementType(this._context, null, this._instruction, 'expectedEmpty');

      this._empty = new empty_module.Empty(this._context, this._instruction, this._parent);
      this._yielded = EMPTY;
    }

    return this._empty;
  }

  toField() {
    if(!this.hasOwnProperty('_field')) {
      if(this.hasOwnProperty('_yielded'))
        throw new Error(`This element was already yielded as ${PRETTY_TYPES[this._yielded]} and can't be yielded again as a field.`);

      if(this._instruction.type != FIELD &&
         this._instruction.type !== MULTILINE_FIELD_BEGIN &&
         this._instruction.type !== FIELD_OR_FIELDSET_OR_LIST)
        throw errors.unexpectedElementType(this._context, null, this._instruction, 'expectedField');

      this._field = new field_module.Field(this._context, this._instruction, this._parent);
      this._yielded = FIELD;
    }

    return this._field;
  }

  toFieldset() {
    if(!this.hasOwnProperty('_fieldset')) {
      if(this.hasOwnProperty('_yielded'))
        throw new Error(`This element was already yielded as ${PRETTY_TYPES[this._yielded]} and can't be yielded again as a fieldset.`);

      if(this._instruction.type !== FIELDSET && this._instruction.type !== FIELD_OR_FIELDSET_OR_LIST)
        throw errors.unexpectedElementType(this._context, null, this._instruction, 'expectedFieldset');

      this._fieldset = new fieldset_module.Fieldset(this._context, this._instruction, this._parent);
      this._yielded = FIELDSET;
    }

    return this._fieldset;
  }

  toList() {
    if(!this.hasOwnProperty('_list')) {
      if(this.hasOwnProperty('_yielded'))
        throw new Error(`This element was already yielded as ${PRETTY_TYPES[this._yielded]} and can't be yielded again as a list.`);

      if(this._instruction.type !== LIST && this._instruction.type !== FIELD_OR_FIELDSET_OR_LIST)
        throw errors.unexpectedElementType(this._context, null, this._instruction, 'expectedList');

      this._list = new list_module.List(this._context, this._instruction, this._parent);
      this._yielded = LIST;
    }

    return this._list;
  }

  toSection() {
    if(!this.hasOwnProperty('_section')) {
      if(this._instruction.type !== SECTION)
        throw errors.unexpectedElementType(this._context, null, this._instruction, 'expectedSection');

      this._section = new section_module.Section(this._context, this._instruction, this._parent);
      this._yielded = SECTION;
    }

    return this._section;
  }

  /**
   * Returns a debug representation of this {@link SectionElement} in the form of `[object SectionElement key=foo yields=field]`.
   *
   * @return {string} A debug representation of this {@link SectionElement}.
   */
  toString() {
    return `[object SectionElement key=${this._key()} yields=${this._yields()}]`;
  }

  touch() {
    if(!this.hasOwnProperty('_yielded')) {
      this._touched = true;
    } else if(this.hasOwnProperty('_empty')) {
      this._empty._touched = true;
    } else if(this.hasOwnProperty('_field')) {
      this._field._touched = true;
    } else if(this.hasOwnProperty('_fieldset')) {
      this._fieldset.touch();
    } else if(this.hasOwnProperty('_list')) {
      this._list.touch();
    } else if(this.hasOwnProperty('_section')) {
      this._section.touch();
    }
  }

  yieldsEmpty() {
    return this._instruction.type === EMPTY;
  }

  yieldsField() {
    return this._instruction.type === FIELD ||
           this._instruction.type === MULTILINE_FIELD_BEGIN ||
           this._instruction.type === FIELD_OR_FIELDSET_OR_LIST;
  }

  yieldsFieldset() {
    return this._instruction.type === FIELDSET ||
           this._instruction.type === FIELD_OR_FIELDSET_OR_LIST;
  }

  yieldsList() {
    return this._instruction.type === LIST ||
           this._instruction.type === FIELD_OR_FIELDSET_OR_LIST;
  }

  yieldsSection() {
    return this._instruction.type === SECTION;
  }
}

exports.SectionElement = SectionElement;

},{"../constants.js":2,"../errors/validation.js":27,"./element_base.js":5,"./empty.js":6,"./field.js":7,"./fieldset.js":8,"./list.js":10,"./section.js":21}],23:[function(require,module,exports){
const { ElementBase } = require('./element_base.js');
const { errors } = require('../errors/validation.js');

class ValueElementBase extends ElementBase {
  _printValue() {
    let value = this._context.value(this._instruction);

    // TODO: Actually we are missing a differentiation between 'null' and null here,
    //       improve at some point (across all implementations)
    if(value === null) return 'null';

    if(value.length > 14) {
      value = value.substring(0, 11) + '...';
    }

    return value.replace('\n', '\\n');
  }

  _value(loader, required) {
    this._touched = true;

    const value = this._context.value(this._instruction);

    if(value === null) {
      if(required)
        throw errors.missingValue(this._context, this._instruction);

      return null;
    }

    if(!loader)
      return value;

    try {
      return loader(value);
    } catch(message) {
      // TODO: Consider a re-specification of what is thrown/caught in regards to loaders,
      //       basically "throw 'plain string';" vs. "throw new Error('wrapped');"
      //       The latter makes much more sense from a standards perspective and probably
      //       should be specified as a new default, but supporting both still would make
      //       sense for the sake of convenience and robustness.

      throw errors.valueError(this._context, message, this._instruction);
    }
  }

  optionalStringValue() {
    return this._value(null, false);
  }

  optionalValue(loader) {
    return this._value(loader, false);
  }

  requiredStringValue() {
    return this._value(null, true);
  }

  requiredValue(loader) {
    return this._value(loader, true);
  }

  /**
   * Constructs and returns a {@link ValidationError} with the supplied message in the context of this element's value.
   *
   * Note that this only *returns* an error, whether you want to just use its
   * metadata, pass it on or actually throw the error is up to you.
   *
   * @param {string|function(value: string): string} message A message or a function that receives the element's value and returns the message.
   * @return {ValidationError} The requested error.
   */
  valueError(message) {
    return errors.valueError(
      this._context,
      typeof message === 'function' ? message(this._context.value(this._instruction)) : message,
      this._instruction
    );
  }
}

exports.ValueElementBase = ValueElementBase;

},{"../errors/validation.js":27,"./element_base.js":5}],24:[function(require,module,exports){
class EnoError extends Error {
  constructor(text, snippet, selection) {
    super(`${text}\n\n${snippet}`);

    this.selection = selection;
    this.snippet = snippet;
    this.text = text;

    if(Error.captureStackTrace) {
      Error.captureStackTrace(this, EnoError);
    }
  }

  get cursor() {
    return this.selection.from;
  }
}

class ParseError extends EnoError {
  constructor(...args) {
    super(...args);

    if(Error.captureStackTrace) {
      Error.captureStackTrace(this, ParseError);
    }
  }
}

class ValidationError extends EnoError {
  constructor(...args) {
    super(...args);

    if(Error.captureStackTrace) {
      Error.captureStackTrace(this, ValidationError);
    }
  }
}

exports.EnoError = EnoError;
exports.ParseError = ParseError;
exports.ValidationError = ValidationError;

},{}],25:[function(require,module,exports){
const { BEGIN, DOCUMENT, END, HUMAN_INDEXING } = require('../constants.js');
const { cursor, selectLine, selectTemplate } = require('./selections.js');
const { ParseError } = require('../error_types.js');

// ```key: value
const UNTERMINATED_ESCAPED_KEY = /^\s*#*\s*(`+)(?!`)((?:(?!\1).)+)$/;
const unterminatedEscapedKey = (context, instruction, unterminated) => {
  const line = context._input.substring(instruction.ranges.line[BEGIN], instruction.ranges.line[END]);
  const selectionColumn = line.lastIndexOf(unterminated);

  return new ParseError(
    context.messages.unterminatedEscapedKey(instruction.line + HUMAN_INDEXING),
    new context.reporter(context).reportLine(instruction).snippet(),
    { from: { column: selectionColumn, index: instruction.ranges.line[0] + selectionColumn, line: instruction.line }, to: cursor(instruction, 'line', END) }
  );
};

exports.errors = {
  cyclicDependency: (context, instruction, instructionChain) => {
    const firstOccurrence = instructionChain.indexOf(instruction);
    const feedbackChain = instructionChain.slice(firstOccurrence);

    const firstInstruction = feedbackChain[0];
    const lastInstruction = feedbackChain[feedbackChain.length - 1];

    let copyInstruction;
    if(lastInstruction.hasOwnProperty('template')) {
      copyInstruction = lastInstruction;
    } else if(firstInstruction.hasOwnProperty('template')) {
      copyInstruction = firstInstruction;
    }

    const reporter = new context.reporter(context);

    reporter.reportLine(copyInstruction);

    for(const element of feedbackChain) {
      if(element !== copyInstruction) {
        reporter.indicateLine(element);
      }
    }

    return new ParseError(
      context.messages.cyclicDependency(copyInstruction.line + HUMAN_INDEXING, copyInstruction.template),
      reporter.snippet(),
      selectTemplate(copyInstruction)
    );
  },

  invalidLine: (context, instruction) => {
    const line = context._input.substring(instruction.ranges.line[BEGIN], instruction.ranges.line[END]);

    let match;
    if( (match = UNTERMINATED_ESCAPED_KEY.exec(line)) ) {
      return unterminatedEscapedKey(context, instruction, match[2]);
    }

    // TODO: This is a reoccurring pattern and can be DRYed up - line_error or something
    //       (Also in other implementations)
    return new ParseError(
      context.messages.invalidLine(instruction.line + HUMAN_INDEXING),
      new context.reporter(context).reportLine(instruction).snippet(),
      selectLine(instruction)
    );
  },

  missingElementForContinuation: (context, continuation) => {
    return new ParseError(
      context.messages.missingElementForContinuation(continuation.line + HUMAN_INDEXING),
      new context.reporter(context).reportLine(continuation).snippet(),
      selectLine(continuation)
    );
  },

  missingFieldsetForFieldsetEntry: (context, entry) => {
    return new ParseError(
      context.messages.missingFieldsetForFieldsetEntry(entry.line + HUMAN_INDEXING),
      new context.reporter(context).reportLine(entry).snippet(),
      selectLine(entry)
    );
  },

  missingListForListItem: (context, item) => {
    return new ParseError(
      context.messages.missingListForListItem(item.line + HUMAN_INDEXING),
      new context.reporter(context).reportLine(item).snippet(),
      selectLine(item)
    );
  },

  nonSectionElementNotFound: (context, copy) => {
    return new ParseError(
      context.messages.nonSectionElementNotFound(copy.line + HUMAN_INDEXING, copy.template),
      new context.reporter(context).reportLine(copy).snippet(),
      selectLine(copy)
    );
  },

  sectionHierarchyLayerSkip: (context, section, superSection) => {
    const reporter = new context.reporter(context).reportLine(section);

    if(superSection.type !== DOCUMENT) {
      reporter.indicateLine(superSection);
    }

    return new ParseError(
      context.messages.sectionHierarchyLayerSkip(section.line + HUMAN_INDEXING),
      reporter.snippet(),
      selectLine(section)
    );
  },

  sectionNotFound: (context, copy) => {
    return new ParseError(
      context.messages.sectionNotFound(copy.line + HUMAN_INDEXING, copy.template),
      new context.reporter(context).reportLine(copy).snippet(),
      selectLine(copy)
    );
  },

  twoOrMoreTemplatesFound: (context, copy, firstTemplate, secondTemplate) => {
    return new ParseError(
      context.messages.twoOrMoreTemplatesFound(copy.template),
      new context.reporter(context).reportLine(copy).questionLine(firstTemplate).questionLine(secondTemplate).snippet(),
      selectLine(copy)
    );
  },

  unterminatedMultilineField: (context, field) => {
    return new ParseError(
      context.messages.unterminatedMultilineField(field.key, field.line + HUMAN_INDEXING),
      new context.reporter(context).reportElement(field).snippet(),
      selectLine(field)
    );
  }
};

},{"../constants.js":2,"../error_types.js":24,"./selections.js":26}],26:[function(require,module,exports){
const {
  BEGIN,
  END,
  FIELD,
  FIELDSET,
  FIELDSET_ENTRY,
  LIST,
  LIST_ITEM,
  MULTILINE_FIELD_BEGIN,
  SECTION
} = require('../constants.js');

// TODO: Strongly consider reverse iteration and/or last subinstruction checks to speed up some lastIn/etc. algorithms here

const lastIn = element => {
  if((element.type === FIELD || element.type === LIST_ITEM || element.type === FIELDSET_ENTRY) && element.continuations.length > 0) {
    return element.continuations[element.continuations.length - 1];
  } else if(element.type === LIST && element.items.length > 0) {
    return lastIn(element.items[element.items.length - 1]);
  } else if(element.type === FIELDSET && element.entries.length > 0) {
    return lastIn(element.entries[element.entries.length - 1]);
  } else if(element.type === MULTILINE_FIELD_BEGIN) {
    return element.end;
  } else if(element.type === SECTION && element.elements.length > 0) {
    return lastIn(element.elements[element.elements.length - 1]);
  } else {
    return element
  }
}

const cursor = (instruction, range, position) => {
  const index = instruction.ranges[range][position];

  return {
    column: index - instruction.ranges.line[BEGIN],
    index: index,
    line: instruction.line
  };
};

const selection = (instruction, range, position, ...to) => {
  const toInstruction = to.find(argument => typeof argument === 'object') || instruction;
  const toRange = to.find(argument => typeof argument === 'string') || range;
  const toPosition = to.find(argument => typeof argument === 'number') || position;

  return {
    from: cursor(instruction, range, position),
    to: cursor(toInstruction, toRange, toPosition)
  };
};

const selectComments = element => {
  const { comments } = element;

  if(comments.length === 1) {
    if(comments[0].hasOwnProperty('comment')) {
      return selection(comments[0], 'comment', BEGIN, END);
    } else {
      return selection(comments[0], 'line', BEGIN, END);
    }
  } else if(comments.length > 1) {
    return selection(comments[0], 'line', BEGIN, comments[comments.length - 1], 'line', END);
  } else {
    return selection(element, 'line', BEGIN);
  }
};

exports.DOCUMENT_BEGIN = {
  from: { column: 0, index: 0, line: 0 },
  to: { column: 0, index: 0, line: 0 }
};

exports.cursor = cursor;
exports.selection = selection;
exports.selectComments = selectComments;
exports.selectElement = element => selection(element, 'line', BEGIN, lastIn(element), 'line', END);
exports.selectKey = element => selection(element, 'key', BEGIN, END);
exports.selectLine = element => selection(element, 'line', BEGIN, END);
exports.selectTemplate = element => selection(element, 'template', BEGIN, END);

},{"../constants.js":2}],27:[function(require,module,exports){
const { ValidationError } = require('../error_types.js');
const { cursor, DOCUMENT_BEGIN, selection, selectComments, selectElement, selectKey } = require('./selections.js');
const {
  BEGIN,
  END,
  DOCUMENT,
  FIELD,
  FIELDSET_ENTRY,
  FIELD_OR_FIELDSET_OR_LIST,
  LIST_ITEM,
  MULTILINE_FIELD_BEGIN
} = require('../constants.js');

// TODO: Here and prominently also elsewhere - consider replacing instruction.ranges.line with instruction[LINE_RANGE] (where LINE_RANGE = Symbol('descriptive'))

exports.errors = {
  commentError: (context, message, element) => {
    return new ValidationError(
      context.messages.commentError(message),
      new context.reporter(context).reportComments(element).snippet(),
      selectComments(element)
    );
  },

  elementError: (context, message, element) => {
    return new ValidationError(
      message,
      new context.reporter(context).reportElement(element).snippet(),
      selectElement(element)
    );
  },

  keyError: (context, message, element) => {
    return new ValidationError(
      context.messages.keyError(message),
      new context.reporter(context).reportLine(element).snippet(),
      selectKey(element)
    );
  },

  missingComment: (context, element) => {
    return new ValidationError(
      context.messages.missingComment,
      new context.reporter(context).reportLine(element).snippet(), // TODO: Question-tag an empty line before an element with missing comment
      selection(element, 'line', BEGIN)
    );
  },

  missingElement: (context, key, parent, message) => {
    return new ValidationError(
      key === null ? context.messages[message] : context.messages[message + 'WithKey'](key),
      new context.reporter(context).reportMissingElement(parent).snippet(),
      parent.type === DOCUMENT ? DOCUMENT_BEGIN : selection(parent, 'line', END)
    );
  },

  // TODO: Revisit and polish the two core value errors again at some point (missingValue / valueError)
  //       (In terms of quality of results and architecture - DRY up probably)
  //       Share best implementation among other eno libraries
  missingValue: (context, element) => {
    let message;
    const selection = {};

    if(element.type === FIELD || element.type === FIELD_OR_FIELDSET_OR_LIST || element.type === MULTILINE_FIELD_BEGIN) {
      message = context.messages.missingFieldValue(element.key);

      if(element.ranges.hasOwnProperty('template')) {
        selection.from = cursor(element, 'template', END);
      } else if(element.ranges.hasOwnProperty('elementOperator')) {
        selection.from = cursor(element, 'elementOperator', END);
      } else {
        selection.from = cursor(element, 'line', END);
      }
    } else if(element.type === FIELDSET_ENTRY) {
      message = context.messages.missingFieldsetEntryValue(element.key);
      selection.from = cursor(element, 'entryOperator', END);
    } else if(element.type === LIST_ITEM) {
      message = context.messages.missingListItemValue(element.parent.key);
      selection.from = cursor(element, 'itemOperator', END);
    }

    const snippet = new context.reporter(context).reportElement(element).snippet();

    if(element.type === FIELD && element.continuations.length > 0) {
      selection.to = cursor(element.continuations[element.continuations.length - 1], 'line', END);
    } else {
      selection.to = cursor(element, 'line', END);
    }

    return new ValidationError(message, snippet, selection);
  },

  unexpectedElement: (context, message, element) => {
    return new ValidationError(
      message || context.messages.unexpectedElement,
      new context.reporter(context).reportElement(element).snippet(),
      selectElement(element)
    );
  },

  unexpectedMultipleElements: (context, key, elements, message) => {
    return new ValidationError(
      key === null ? context.messages[message] : context.messages[message + 'WithKey'](key),
      new context.reporter(context).reportElements(elements).snippet(),
      selectElement(elements[0])
    );
  },

  unexpectedElementType: (context, key, section, message) => {
    return new ValidationError(
      key === null ? context.messages[message] : context.messages[message + 'WithKey'](key),
      new context.reporter(context).reportElement(section).snippet(),
      selectElement(section)
    );
  },

  valueError: (context, message, element) => {
    let snippet, select;

    if(element.mirror) {
      snippet = new context.reporter(context).reportLine(element).snippet();
      select = selectKey(element);
    } else if(element.type === MULTILINE_FIELD_BEGIN) {
      if(element.lines.length > 0) {
        snippet = new context.reporter(context).reportMultilineValue(element).snippet();
        select = selection(element.lines[0], 'line', BEGIN, element.lines[element.lines.length - 1], 'line', END);
      } else {
        snippet = new context.reporter(context).reportElement(element).snippet();
        select = selection(element, 'line', END);
      }
    } else {
      snippet = new context.reporter(context).reportElement(element).snippet();
      select = {};

      if(element.ranges.hasOwnProperty('value')) {
        select.from = cursor(element, 'value', BEGIN);
      } else if(element.ranges.hasOwnProperty('elementOperator')) {
        select.from = cursor(element, 'elementOperator', END);
      } else if(element.ranges.hasOwnProperty('entryOperator')) {
        select.from = cursor(element, 'entryOperator', END);
      } else if(element.type === LIST_ITEM) {
        select.from = cursor(element, 'itemOperator', END);
      } else {
        // TODO: Possibly never reached - think through state permutations
        select.from = cursor(element, 'line', END);
      }

      if(element.continuations.length > 0) {
        select.to = cursor(element.continuations[element.continuations.length - 1], 'line', END);
      } else if(element.ranges.hasOwnProperty('value')) {
        select.to = cursor(element, 'value', END);
      } else {
        select.to = cursor(element, 'line', END);
      }
    }

    return new ValidationError(context.messages.valueError(message), snippet, select);
  }
};

},{"../constants.js":2,"../error_types.js":24,"./selections.js":26}],28:[function(require,module,exports){
// Note: Study this file from the bottom up

const OPTIONAL = '([^\\n]+?)?';
const REQUIRED = '(\\S[^\\n]*?)';

//
const EMPTY_LINE = '()';
exports.EMPTY_LINE_INDEX = 1;

// | value
const DIRECT_LINE_CONTINUATION = `(\\|)[^\\S\\n]*${OPTIONAL}`;
exports.DIRECT_LINE_CONTINUATION_OPERATOR_INDEX = 2;
exports.DIRECT_LINE_CONTINUATION_VALUE_INDEX = 3;

// \ value
const SPACED_LINE_CONTINUATION = `(\\\\)[^\\S\\n]*${OPTIONAL}`;
exports.SPACED_LINE_CONTINUATION_OPERATOR_INDEX = 4;
exports.SPACED_LINE_CONTINUATION_VALUE_INDEX = 5;

const CONTINUATION = `${DIRECT_LINE_CONTINUATION}|${SPACED_LINE_CONTINUATION}`;

// > comment
const COMMENT = `(>)[^\\S\\n]*${OPTIONAL}`;
exports.COMMENT_OPERATOR_INDEX = 6;
exports.COMMENT_INDEX = 7;

// - value
const LIST_ITEM = `(-)(?!-)[^\\S\\n]*${OPTIONAL}`;
exports.LIST_ITEM_OPERATOR_INDEX = 8;
exports.LIST_ITEM_VALUE_INDEX = 9;

// -- key
const MULTILINE_FIELD = `(-{2,})(?!-)[^\\S\\n]*${REQUIRED}`;
exports.MULTILINE_FIELD_OPERATOR_INDEX = 10;
exports.MULTILINE_FIELD_KEY_INDEX = 11;

// #
const SECTION_OPERATOR = '(#+)(?!#)';
exports.SECTION_OPERATOR_INDEX = 12;

// # key
const SECTION_KEY_UNESCAPED = '([^`\\s<][^<\\n]*?)';
exports.SECTION_KEY_UNESCAPED_INDEX = 13;

// # `key`
const SECTION_KEY_ESCAPE_BEGIN_OPERATOR_INDEX = 14
const SECTION_KEY_ESCAPED = `(\`+)(?!\`)[^\\S\\n]*(\\S[^\\n]*?)[^\\S\\n]*\\${SECTION_KEY_ESCAPE_BEGIN_OPERATOR_INDEX}`; // TODO: Should this exclude the backreference inside the quotes? (as in ((?:(?!\\1).)+) ) here and elsewhere (probably not because it's not greedy.?)
exports.SECTION_KEY_ESCAPE_BEGIN_OPERATOR_INDEX = SECTION_KEY_ESCAPE_BEGIN_OPERATOR_INDEX;
exports.SECTION_KEY_ESCAPED_INDEX = 15;

// # key <(<) template
// # `key` <(<) template
const SECTION_KEY = `(?:${SECTION_KEY_UNESCAPED}|${SECTION_KEY_ESCAPED})`;
const SECTION_TEMPLATE = `(?:(<(?!<)|<<)[^\\S\\n]*${REQUIRED})?`;
const SECTION = `${SECTION_OPERATOR}\\s*${SECTION_KEY}[^\\S\\n]*${SECTION_TEMPLATE}`;
exports.SECTION_COPY_OPERATOR_INDEX = 16;
exports.SECTION_TEMPLATE_INDEX = 17;

const EARLY_DETERMINED = `${CONTINUATION}|${COMMENT}|${LIST_ITEM}|${MULTILINE_FIELD}|${SECTION}`;

// key
const KEY_UNESCAPED = '([^\\s>#\\-`\\\\|:=<][^:=<\\n]*?)';
exports.KEY_UNESCAPED_INDEX = 18;

// `key`
const KEY_ESCAPE_BEGIN_OPERATOR_INDEX = 19
const KEY_ESCAPED = `(\`+)(?!\`)[^\\S\\n]*(\\S[^\\n]*?)[^\\S\\n]*\\${KEY_ESCAPE_BEGIN_OPERATOR_INDEX}`;
exports.KEY_ESCAPE_BEGIN_OPERATOR_INDEX = KEY_ESCAPE_BEGIN_OPERATOR_INDEX;
exports.KEY_ESCAPED_INDEX = 20;

const KEY = `(?:${KEY_UNESCAPED}|${KEY_ESCAPED})`;

// :
// : value
const FIELD_OR_FIELDSET_OR_LIST = `(:)[^\\S\\n]*${OPTIONAL}`;
exports.ELEMENT_OPERATOR_INDEX = 21;
exports.FIELD_VALUE_INDEX = 22;

// =
// = value
const FIELDSET_ENTRY = `(=)[^\\S\\n]*${OPTIONAL}`;
exports.FIELDSET_ENTRY_OPERATOR_INDEX = 23;
exports.FIELDSET_ENTRY_VALUE_INDEX = 24;

// < template
const TEMPLATE = `<\\s*${REQUIRED}`;
exports.TEMPLATE_INDEX = 25;

const LATE_DETERMINED = `${KEY}\\s*(?:${FIELD_OR_FIELDSET_OR_LIST}|${FIELDSET_ENTRY}|${TEMPLATE})?`;

const NON_EMPTY_LINE = `(?:${EARLY_DETERMINED}|${LATE_DETERMINED})`;

exports.GRAMMAR_REGEXP = new RegExp(`[^\\S\\n]*(?:${EMPTY_LINE}|${NON_EMPTY_LINE})[^\\S\\n]*(?=\\n|$)`, 'y');

},{}],29:[function(require,module,exports){
//  GENERATED ON 2019-06-18T08:50:41 - DO NOT EDIT MANUALLY

module.exports = {
  contentHeader: 'Content',
  expectedDocument: 'The document was expected.',
  expectedEmpty: 'An empty was expected.',
  expectedField: 'A field was expected.',
  expectedFields: 'Only fields were expected.',
  expectedFieldset: 'A fieldset was expected.',
  expectedFieldsetEntry: 'A fieldset entry was expected.',
  expectedFieldsets: 'Only fieldsets were expected.',
  expectedList: 'A list was expected.',
  expectedListItem: 'A list item was expected.',
  expectedLists: 'Only lists were expected.',
  expectedSection: 'A section was expected.',
  expectedSections: 'Only sections were expected.',
  expectedSingleElement: 'Only a single element was expected.',
  expectedSingleEmpty: 'Only a single empty was expected.',
  expectedSingleField: 'Only a single field was expected.',
  expectedSingleFieldset: 'Only a single fieldset was expected.',
  expectedSingleFieldsetEntry: 'Only a single fieldset entry was expected.',
  expectedSingleList: 'Only a single list was expected.',
  expectedSingleSection: 'Only a single section was expected.',
  gutterHeader: 'Line',
  missingComment: 'A required comment for this element is missing.',
  missingElement: 'A single element is required - it can have any key.',
  missingEmpty: 'A single empty is required - it can have any key.',
  missingField: 'A single field is required - it can have any key.',
  missingFieldset: 'A single fieldset is required - it can have any key.',
  missingFieldsetEntry: 'A single fieldset entry is required - it can have any key.',
  missingList: 'A single list is required - it can have any key.',
  missingSection: 'A single section is required - it can have any key.',
  unexpectedElement: 'This element was not expected, make sure it is at the right place in the document and that its key is not mis-typed.',
  commentError: (message) => `There is a problem with the comment of this element: ${message}`,
  cyclicDependency: (line, key) => `In line ${line} '${key}' is copied into itself.`,
  expectedEmptyWithKey: (key) => `An empty with the key '${key}' was expected.`,
  expectedFieldWithKey: (key) => `A field with the key '${key}' was expected.`,
  expectedFieldsWithKey: (key) => `Only fields with the key '${key}' were expected.`,
  expectedFieldsetWithKey: (key) => `A fieldset with the key '${key}' was expected.`,
  expectedFieldsetsWithKey: (key) => `Only fieldsets with the key '${key}' were expected.`,
  expectedListWithKey: (key) => `A list with the key '${key}' was expected.`,
  expectedListsWithKey: (key) => `Only lists with the key '${key}' were expected.`,
  expectedSectionWithKey: (key) => `A section with the key '${key}' was expected.`,
  expectedSectionsWithKey: (key) => `Only sections with the key '${key}' were expected.`,
  expectedSingleElementWithKey: (key) => `Only a single element with the key '${key}' was expected.`,
  expectedSingleEmptyWithKey: (key) => `Only a single empty with the key '${key}' was expected.`,
  expectedSingleFieldWithKey: (key) => `Only a single field with the key '${key}' was expected.`,
  expectedSingleFieldsetEntryWithKey: (key) => `Only a single fieldset entry with the key '${key}' was expected.`,
  expectedSingleFieldsetWithKey: (key) => `Only a single fieldset with the key '${key}' was expected.`,
  expectedSingleListWithKey: (key) => `Only a single list with the key '${key}' was expected.`,
  expectedSingleSectionWithKey: (key) => `Only a single section with the key '${key}' was expected.`,
  invalidLine: (line) => `Line ${line} does not follow any specified pattern.`,
  keyError: (message) => `There is a problem with the key of this element: ${message}`,
  missingElementForContinuation: (line) => `Line ${line} contains a line continuation without a continuable element being specified before.`,
  missingElementWithKey: (key) => `The element '${key}' is missing - in case it has been specified look for typos and also check for correct capitalization.`,
  missingEmptyWithKey: (key) => `The empty '${key}' is missing - in case it has been specified look for typos and also check for correct capitalization.`,
  missingFieldValue: (key) => `The field '${key}' must contain a value.`,
  missingFieldWithKey: (key) => `The field '${key}' is missing - in case it has been specified look for typos and also check for correct capitalization.`,
  missingFieldsetEntryValue: (key) => `The fieldset entry '${key}' must contain a value.`,
  missingFieldsetEntryWithKey: (key) => `The fieldset entry '${key}' is missing - in case it has been specified look for typos and also check for correct capitalization.`,
  missingFieldsetForFieldsetEntry: (line) => `Line ${line} contains a fieldset entry without a fieldset being specified before.`,
  missingFieldsetWithKey: (key) => `The fieldset '${key}' is missing - in case it has been specified look for typos and also check for correct capitalization.`,
  missingListForListItem: (line) => `Line ${line} contains a list item without a list being specified before.`,
  missingListItemValue: (key) => `The list '${key}' may not contain empty items.`,
  missingListWithKey: (key) => `The list '${key}' is missing - in case it has been specified look for typos and also check for correct capitalization.`,
  missingSectionWithKey: (key) => `The section '${key}' is missing - in case it has been specified look for typos and also check for correct capitalization.`,
  nonSectionElementNotFound: (line, key) => `In line ${line} the non-section element '${key}' should be copied, but it was not found.`,
  sectionHierarchyLayerSkip: (line) => `Line ${line} starts a section that is more than one level deeper than the current one.`,
  sectionNotFound: (line, key) => `In line ${line} the section '${key}' should be copied, but it was not found.`,
  twoOrMoreTemplatesFound: (key) => `There are at least two elements with the key '${key}' that qualify for being copied here, it is not clear which to copy.`,
  unterminatedEscapedKey: (line) => `In line ${line} the key of an element is escaped, but the escape sequence is not terminated until the end of the line.`,
  unterminatedMultilineField: (key, line) => `The multiline field '${key}' starting in line ${line} is not terminated until the end of the document.`,
  valueError: (message) => `There is a problem with the value of this element: ${message}`
};
},{}],30:[function(require,module,exports){
const { Context } = require('./context.js');
const { Element } = require('./elements/element.js');

// TODO: if(element.type === MULTILINE_FIELD_BEGIN) - Here and elsewhere there will be trouble if the multiline field is really COPIED, because then we can't go through .lines (!) revisit boldly

const {
  BEGIN,
  END,
  FIELD,
  FIELDSET,
  LIST,
  MULTILINE_FIELD_BEGIN,
  SECTION
} = require('./constants.js');

const checkMultilineFieldByLine = (field, line) => {
  if(line < field.line || line > field.end.line)
    return false;

  if(line === field.line)
    return { element: field, instruction: field };

  if(line === field.end.line)
    return { element: field, instruction: field.end };

  return { element: field, instruction: field.lines.find(valueLine => valueLine.line === line) };
};

const checkMultilineFieldByIndex = (field, index) => {
  if(index < field.ranges.line[BEGIN] || index > field.end.ranges.line[END])
    return false;

  if(index <= field.ranges.line[END])
    return { element: field, instruction: field };

  if(index >= field.end.ranges.line[BEGIN])
    return { element: field, instruction: field.end };

  return { element: field, instruction: field.lines.find(line => index <= line.ranges.line[END]) };
};

const checkFieldByLine = (field, line) => {
  if(line < field.line)
    return false;

  if(line === field.line)
    return { element: field, instruction: field };

  if(!field.hasOwnProperty('continuations') ||
     field.continuations.length === 0 ||
     line > field.continuations[field.continuations.length - 1].line)
    return false;

  for(const continuation of field.continuations) {
    if(line === continuation.line)
      return { element: field, instruction: continuation };
    if(line < continuation.line)
      return { element: field, instruction: null };
  }
};

const checkFieldByIndex = (field, index) => {
  if(index < field.ranges.line[BEGIN])
    return false;

  if(index <= field.ranges.line[END])
    return { element: field, instruction: field };

  if(!field.hasOwnProperty('continuations') ||
     field.continuations.length === 0 ||
     index > field.continuations[field.continuations.length - 1].ranges.line[END])
    return false;

  for(const continuation of field.continuations) {
    if(index < continuation.ranges.line[BEGIN])
      return { element: field, instruction: null };
    if(index <= continuation.ranges.line[END])
      return { element: field, instruction: continuation };
  }
};

const checkFieldsetByLine = (fieldset, line) => {
  if(line < fieldset.line)
    return false;

  if(line === fieldset.line)
    return { element: fieldset, instruction: fieldset };

  if(!fieldset.hasOwnProperty('entries') ||
     fieldset.entries.length === 0 ||
     line > fieldset.entries[fieldset.entries.length - 1].line)
    return false;

  for(const entry of fieldset.entries) {
    if(line === entry.line)
      return { element: entry, instruction: entry };

      if(line < entry.line) {
        if(entry.hasOwnProperty('comments') && line >= entry.comments[0].line) {
          return {
            element: entry,
            instruction: entry.comments.find(comment => line == comment.line)
          };
        }
        return { element: fieldset, instruction: null };
      }

    const matchInEntry = checkFieldByLine(entry, line);

    if(matchInEntry)
      return matchInEntry;
  }
};

const checkFieldsetByIndex = (fieldset, index) => {
  if(index < fieldset.ranges.line[BEGIN])
    return false;

  if(index <= fieldset.ranges.line[END])
    return { element: fieldset, instruction: fieldset };

  if(!fieldset.hasOwnProperty('entries') ||
     fieldset.entries.length === 0 ||
     index > fieldset.entries[fieldset.entries.length - 1].ranges.line[END])
    return false;

  for(const entry of fieldset.entries) {
    if(index < entry.ranges.line[BEGIN]) {
      if(entry.hasOwnProperty('comments') && index >= entry.comments[0].ranges.line[BEGIN]) {
        return {
          element: entry,
          instruction: entry.comments.find(comment => index <= comment.ranges.line[END])
        };
      }
      return { element: fieldset, instruction: null };
    }

    if(index <= entry.ranges.line[END])
      return { element: entry, instruction: entry };

    const matchInEntry = checkFieldByIndex(entry, index);

    if(matchInEntry)
      return matchInEntry;
  }
};

const checkListByLine = (list, line) => {
  if(line < list.line)
    return false;

  if(line === list.line)
    return { element: list, instruction: list };

  if(!list.hasOwnProperty('items') ||
     line > list.items[list.items.length - 1].line)
    return false;

  for(const item of list.items) {
    if(line === item.line)
      return { element: item, instruction: item };

    if(line < item.line) {
      if(item.hasOwnProperty('comments') && line >= item.comments[0].line) {
        return {
          element: item,
          instruction: item.comments.find(comment => line == comment.line)
        };
      }
      return { element: list, instruction: null };
    }

    const matchInItem = checkFieldByLine(item, line);

    if(matchInItem)
      return matchInItem;
  }
};

const checkListByIndex = (list, index) => {
  if(index < list.ranges.line[BEGIN])
    return false;

  if(index <= list.ranges.line[END])
    return { element: list, instruction: list };

  if(!list.hasOwnProperty('items') ||
     index > list.items[list.items.length - 1].ranges.line[END])
    return false;

  for(const item of list.items) {
    if(index < item.ranges.line[BEGIN]) {
      if(item.hasOwnProperty('comments') && index >= item.comments[0].ranges.line[BEGIN]) {
        return {
          element: item,
          instruction: item.comments.find(comment => index <= comment.ranges.line[END])
        };
      }
      return { element: list, instruction: null };
    }

    if(index <= item.ranges.line[END])
      return { element: item, instruction: item };

    const matchInItem = checkFieldByIndex(item, index);

    if(matchInItem)
      return matchInItem;
  }
};

const checkInSectionByLine = (section, line) => {
  for(let elementIndex = section.elements.length - 1; elementIndex >= 0; elementIndex--) {
    const element = section.elements[elementIndex];

    if(element.hasOwnProperty('comments')) {
      if(line < element.comments[0].line) continue;

      if(line <= element.comments[element.comments.length - 1].line) {
        return {
          element: element,
          instruction: element.comments.find(comment => line == comment.line)
        };
      }
    }

    if(element.line > line)
      continue;

    if(element.line === line)
      return { element: element, instruction: element };

    switch(element.type) {
      case FIELD: {
        const matchInField = checkFieldByLine(element, line);
        if(matchInField) return matchInField;
        break;
      }
      case FIELDSET: {
        const matchInFieldset = checkFieldsetByLine(element, line);
        if(matchInFieldset) return matchInFieldset;
        break;
      }
      case LIST: {
        const matchInList = checkListByLine(element, line);
        if(matchInList) return matchInList;
        break;
      }
      case MULTILINE_FIELD_BEGIN:
        if(!element.hasOwnProperty('template')) {  // TODO: More elegant copy detection?
          const matchInMultilineField = checkMultilineFieldByLine(element, line);
          if(matchInMultilineField) return matchInMultilineField;
        }
        break;
      case SECTION:
        return checkInSectionByLine(element, line);
    }
    break;
  }
  return { element: section, instruction: null };
};

const checkInSectionByIndex = (section, index) => {
  for(let elementIndex = section.elements.length - 1; elementIndex >= 0; elementIndex--) {
    const element = section.elements[elementIndex];

    if(element.hasOwnProperty('comments')) {
      if(index < element.comments[0].ranges.line[BEGIN]) continue;

      if(index <= element.comments[element.comments.length - 1].ranges.line[END]) {
        return {
          element: element,
          instruction: element.comments.find(comment => index <= comment.ranges.line[END])
        };
      }
    }

    if(index < element.ranges.line[BEGIN])
      continue;

    if(index <= element.ranges.line[END])
      return { element: element, instruction: element };

    switch(element.type) {
      case FIELD: {
        const matchInField = checkFieldByIndex(element, index);
        if(matchInField) return matchInField;
        break;
      }
      case FIELDSET: {
        const matchInFieldset = checkFieldsetByIndex(element, index);
        if(matchInFieldset) return matchInFieldset;
        break;
      }
      case LIST: {
        const matchInList = checkListByIndex(element, index);
        if(matchInList) return matchInList;
        break;
      }
      case MULTILINE_FIELD_BEGIN:
        if(!element.hasOwnProperty('template')) {  // TODO: More elegant copy detection?
          const matchInMultilineField = checkMultilineFieldByIndex(element, index);
          if(matchInMultilineField) return matchInMultilineField;
        }
        break;
      case SECTION:
        return checkInSectionByIndex(element, index);
    }
    break;
  }
  return { element: section, instruction: null };
};


exports.lookup = (position, input, options = {}) => {
  let { column, index, line } = position;

  const context = new Context(input, options);

  let match;
  if(index === undefined) {
    if(line < 0 || line >= context._lineCount)
      throw new RangeError(`You are trying to look up a line (${line}) outside of the document's line range (0-${context._lineCount - 1})`);

    match = checkInSectionByLine(context._document, line);
  } else {
    if(index < 0 || index > context._input.length)
      throw new RangeError(`You are trying to look up an index (${index}) outside of the document's index range (0-${context._input.length})`);

    match = checkInSectionByIndex(context._document, index);
  }

  const result = {
    element: new Element(context, match.element),
    range: null
  };

  let instruction = match.instruction;

  if(!instruction) {
    if(index === undefined) {
      instruction = context._meta.find(instruction => instruction.line === line);
    } else {
      instruction = context._meta.find(instruction =>
        index >= instruction.ranges.line[BEGIN] && index <= instruction.ranges.line[END]
      );
    }

    if(!instruction)
      return result;
  }

  let rightmostMatch = instruction.ranges.line[0];

  if(index === undefined) {
    index = instruction.ranges.line[0] + column;
  }

  for(const [type, range] of Object.entries(instruction.ranges)) {
    if(type === 'line') continue;

    if(index >= range[BEGIN] && index <= range[END] && range[BEGIN] >= rightmostMatch) {
      result.range = type;
      // TODO: Provide content of range too as convenience
      rightmostMatch = index;
    }
  }

  return result;
};

},{"./constants.js":2,"./context.js":3,"./elements/element.js":4}],31:[function(require,module,exports){
const error_types_module = require('./error_types.js');

exports.EnoError = error_types_module.EnoError;
exports.HtmlReporter = require('./reporters/html_reporter.js').HtmlReporter;
exports.lookup = require('./lookup.js').lookup;
exports.parse = require('./parse.js').parse;
exports.ParseError = error_types_module.ParseError;
exports.register = require('./register.js').register;
exports.TerminalReporter = require('./reporters/terminal_reporter.js').TerminalReporter;
exports.TextReporter = require('./reporters/text_reporter.js').TextReporter;
exports.ValidationError = error_types_module.ValidationError;

},{"./error_types.js":24,"./lookup.js":30,"./parse.js":32,"./register.js":33,"./reporters/html_reporter.js":34,"./reporters/terminal_reporter.js":36,"./reporters/text_reporter.js":37}],32:[function(require,module,exports){
const { Context } = require('./context.js');
const { Section } = require('./elements/section.js');

/**
 * Main parser entry point
 * @param {string} input The *content* of an eno document as a string
 * @param {object} options Optional parser settings
 * @param {object} options.locale A custom locale for error messages
 * @param {string} options.source A source label to include in error messages - provide (e.g.) a filename or path to let users know in which file the error occured.
 */
window.enoParse = exports.parse = (input, options = {}) => {
  const context = new Context(input, options);

  return new Section(context, context._document);
};

},{"./context.js":3,"./elements/section.js":21}],33:[function(require,module,exports){
const { ElementBase } = require('./elements/element_base.js');
const { List } = require('./elements/list.js');
const { MissingElementBase } = require('./elements/missing/missing_element_base.js');
const { MissingList } = require('./elements/missing/missing_list.js');
const { MissingValueElementBase } = require('./elements/missing/missing_value_element_base.js');
const { ValueElementBase } = require('./elements/value_element_base.js');

const _register = (name, func) => {
  if(name.match(/^\s*$/))
    throw new Error('Anonymous functions cannot be registered as loaders, please use register({ myName: myFunc }) or register({ myFunc }) syntax to explicitly provide a name.');

  if(name === 'string')
    throw new Error("You cannot register 'string' as a type/loader with enolib as this conflicts with the native string type accessors.");

  const titleCased = name.replace(/^./, inital => inital.toUpperCase());

  ElementBase.prototype[`${name}Key`] = function() { return this.key(func); };
  ElementBase.prototype[`optional${titleCased}Comment`] = function() { return this.optionalComment(func); };
  ElementBase.prototype[`required${titleCased}Comment`] = function() { return this.requiredComment(func); };
  ValueElementBase.prototype[`optional${titleCased}Value`] = function() { return this.optionalValue(func); };
  ValueElementBase.prototype[`required${titleCased}Value`] = function() { return this.requiredValue(func); };
  List.prototype[`optional${titleCased}Values`] = function() { return this.optionalValues(func); };
  List.prototype[`required${titleCased}Values`] = function() { return this.requiredValues(func); };
  MissingElementBase.prototype[`${name}Key`] = MissingElementBase.prototype.stringKey;
  MissingElementBase.prototype[`optional${titleCased}Comment`] = MissingElementBase.prototype.optionalStringComment;
  MissingElementBase.prototype[`required${titleCased}Comment`] = MissingElementBase.prototype.requiredStringComment;
  MissingValueElementBase.prototype[`optional${titleCased}Value`] = MissingValueElementBase.prototype.optionalStringValue;
  MissingValueElementBase.prototype[`required${titleCased}Value`] = MissingValueElementBase.prototype.requiredStringValue;
  MissingList.prototype[`optional${titleCased}Values`] = MissingList.prototype.optionalStringValues;
  MissingList.prototype[`required${titleCased}Values`] = MissingList.prototype.requiredStringValues;
};

// TODO: Document method signature on the website and here in JSDoc form
/**
 * Globally register loaders in the enolib API
 */
exports.register = (...definitions) => {
  for(let definition of definitions) {
    if(typeof definition === 'function') {
      _register(definition.name, definition);
    } else /* if(typeof definition === 'object') */ {
      for(let [name, func] of Object.entries(definition)) {
        _register(name, func);
      }
    }
  }
};

},{"./elements/element_base.js":5,"./elements/list.js":10,"./elements/missing/missing_element_base.js":12,"./elements/missing/missing_list.js":17,"./elements/missing/missing_value_element_base.js":20,"./elements/value_element_base.js":23}],34:[function(require,module,exports){
const { EMPHASIZE, INDICATE, OMISSION, QUESTION } = require('./reporter.js');
const { HUMAN_INDEXING } = require('../constants.js');
const { Reporter } = require('./reporter.js');

// TODO: Possibly introduce here too
// const INDICATORS = {
//   [DISPLAY]: ' ',
//   [EMPHASIZE]: '>',
//   [INDICATE]: '*',
//   [QUESTION]: '?'
// };

const HTML_ESCAPE = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '/': '&#x2F;'
};

const escape = string => string.replace(/[&<>"'/]/g, c => HTML_ESCAPE[c]);

class HtmlReporter extends Reporter {
  _line(line, tag) {
    if(tag === OMISSION)
      return this._markup('...', '...');

    const number = (line + HUMAN_INDEXING).toString();
    const instruction = this._index[line];


    let content;
    if(instruction === undefined) {
      content = '';
    }  else {
      content = this._context._input.substring(instruction.ranges.line[0], instruction.ranges.line[1]);
    }

    let tagClass;
    if(tag === EMPHASIZE) {
      tagClass = 'eno-report-line-emphasized';
    } else if(tag === INDICATE) {
      tagClass = 'eno-report-line-indicated';
    } else if(tag === QUESTION) {
      tagClass = 'eno-report-line-questioned';
    }

    return this._markup(number, content, tagClass);
  }

  _markup(gutter, content, tagClass = '') {
    return `<div class="eno-report-line ${tagClass}">` +
           `<div class="eno-report-gutter">${gutter.padStart(10)}</div>` +
           `<div class="eno-report-content">${escape(content)}</div>` +
           '</div>';
  }

  _print() {
    const columnsHeader = this._markup(this._context.messages.gutterHeader, this._context.messages.contentHeader);
    const snippet = this._snippet.map((tag, line) => this._line(line, tag))
                                 .filter(line => line !== undefined)
                                 .join('');

    return `<div>${this._context.source ? `<div>${this._context.source}</div>` : ''}<pre class="eno-report">${columnsHeader}${snippet}</pre></div>`;
  }
}

exports.HtmlReporter = HtmlReporter;

},{"../constants.js":2,"./reporter.js":35}],35:[function(require,module,exports){
const {
  DOCUMENT,
  FIELD,
  FIELDSET,
  FIELDSET_ENTRY,
  LIST,
  LIST_ITEM,
  MULTILINE_FIELD_BEGIN,
  SECTION
} = require('../constants.js');

// TODO: Better simple lastIn() / lastMissingIn() utility function usage to get m...n range for tagging?

const DISPLAY = Symbol('Display Line');
const EMPHASIZE = Symbol('Emphasize Line');
const INDICATE = Symbol('Indicate Line');
const OMISSION = Symbol('Insert Omission');
const QUESTION = Symbol('Question Line');

class Reporter {
  constructor(context) {
    this._context = context;
    this._index = new Array(this._context._lineCount);
    this._snippet = new Array(this._context._lineCount);

    this._buildIndex()
  }

  _buildIndex() {
    const indexComments = element => {
      if(element.hasOwnProperty('comments')) {
        for(const comment of element.comments) {
          this._index[comment.line] = comment;
        }
      }
    };

    const traverse = section => {
      for(const element of section.elements) {
        indexComments(element);

        this._index[element.line] = element;

        if(element.type === SECTION) {
          traverse(element);
        } else if(element.type === FIELD) {
          if(element.hasOwnProperty('continuations')) {
            for(const continuation of element.continuations) {
              this._index[continuation.line] = continuation;
            }
          }
        } else if(element.type === MULTILINE_FIELD_BEGIN) {
          // Missing when reporting an unterminated multiline field
          if(element.hasOwnProperty('end')) {
            this._index[element.end.line] = element.end;
          }

          for(const line of element.lines) {
            this._index[line.line] = line;
          }
        } else if(element.type === LIST) {
          if(element.hasOwnProperty('items')) {
            for(const item of element.items) {
              indexComments(item);

              this._index[item.line] = item;

              for(const continuation of item.continuations) {
                this._index[continuation.line] = continuation;
              }
            }
          }
        } else if(element.type === FIELDSET) {
          if(element.hasOwnProperty('entries')) {
            for(const entry of element.entries) {
              indexComments(entry);

              this._index[entry.line] = entry;

              for(const continuation of entry.continuations) {
                this._index[continuation.line] = continuation;
              }
            }
          }
        }
      }
    }

    traverse(this._context._document);

    for(const meta of this._context._meta) {
      this._index[meta.line] = meta;
    }
  }

  _tagContinuations(element, tag) {
    let scanLine = element.line + 1;

    if(element.continuations.length === 0)
      return scanLine;

    for(const continuation of element.continuations) {
      while(scanLine < continuation.line) {
        this._snippet[scanLine] = tag;
        scanLine++;
      }

      this._snippet[continuation.line] = tag;
      scanLine++;
    }

    return scanLine;
  }

  _tagContinuables(element, collection, tag) {
    let scanLine = element.line + 1;

    if(element[collection].length === 0)
      return scanLine;

    for(const continuable of element[collection]) {
      while(scanLine < continuable.line) {
        this._snippet[scanLine] = tag;
        scanLine++;
      }

      this._snippet[continuable.line] = tag;

      scanLine = this._tagContinuations(continuable, tag);
    }

    return scanLine;
  }

  _tagChildren(element, tag) {
    if(element.type === FIELD || element.type === LIST_ITEM || element.type === FIELDSET_ENTRY) {
      return this._tagContinuations(element, tag);
    } else if(element.type === LIST) {
      return this._tagContinuables(element, 'items', tag);
    } else if(element.type === FIELDSET) {
      return this._tagContinuables(element, 'entries', tag);
    } else if(element.type === MULTILINE_FIELD_BEGIN) {
      for(const line of element.lines) {
        this._snippet[line.line] = tag;
      }

      if(element.hasOwnProperty('end')) {
        this._snippet[element.end.line] = tag;
        return element.end.line + 1;
      } else if(element.lines.length > 0) {
        return element.lines[element.lines.length - 1].line + 1;
      } else {
        return element.line + 1;
      }
    } else if(element.type === SECTION) {
      return this._tagSection(element, tag);
    }
  }

  _tagSection(section, tag, recursive = true) {
    let scanLine = section.line + 1;

    for(const element of section.elements) {
      while(scanLine < element.line) {
        this._snippet[scanLine] = tag;
        scanLine++;
      }

      if(!recursive && element.type === SECTION) break;

      this._snippet[element.line] = tag;

      scanLine = this._tagChildren(element, tag);
    }

    return scanLine;
  }

  indicateLine(element) {
    this._snippet[element.line] = INDICATE;
    return this;
  }

  questionLine(element) {
    this._snippet[element.line] = QUESTION;
    return this;
  }

  reportComments(element) {
    this._snippet[element.line] = INDICATE;
    for(const comment of element.comments) {
      this._snippet[comment.line] = EMPHASIZE;
    }

    return this;
  }

  reportElement(element) {
    this._snippet[element.line] = EMPHASIZE;
    this._tagChildren(element, INDICATE);

    return this;
  }

  reportElements(elements) {
    for(const element of elements) {
      this._snippet[element.line] = EMPHASIZE;
      this._tagChildren(element, INDICATE);
    }

    return this;
  }

  reportLine(instruction) {
    this._snippet[instruction.line] = EMPHASIZE;

    return this;
  }

  reportMultilineValue(element) {
    for(const line of element.lines) {
      this._snippet[line.line] = EMPHASIZE;
    }

    return this;
  }

  reportMissingElement(parent) {
    if(parent.type !== DOCUMENT) {
      this._snippet[parent.line] = INDICATE;
    }

    if(parent.type === SECTION) {
      this._tagSection(parent, QUESTION, false);
    } else {
      this._tagChildren(parent, QUESTION);
    }

    return this;
  }

  snippet() {
    if(this._snippet.every(line => line === undefined)) {
      for(let line = 0; line < this._snippet.length; line++) {
        this._snippet[line] = QUESTION;
      }
    } else {
      // TODO: Possibly better algorithm for this

      for(const [line, tag] of this._snippet.entries()) {
        if(tag !== undefined) continue;

        // TODO: Prevent out of bounds access
        if(this._snippet[line + 2] !== undefined && this._snippet[line + 2] !== DISPLAY ||
           this._snippet[line - 2] !== undefined && this._snippet[line - 2] !== DISPLAY ||
           this._snippet[line + 1] !== undefined && this._snippet[line + 1] !== DISPLAY ||
           this._snippet[line - 1] !== undefined && this._snippet[line - 1] !== DISPLAY) {
          this._snippet[line] = DISPLAY;
        } else if(this._snippet[line + 3] !== undefined && this._snippet[line + 3] !== DISPLAY) {
          this._snippet[line] = OMISSION;
        }
      }

      if(this._snippet[this._snippet.length - 1] === undefined) {
        this._snippet[this._snippet.length - 1] = OMISSION;
      }
    }

    return this._print();
  }
}

exports.DISPLAY = DISPLAY;
exports.EMPHASIZE = EMPHASIZE;
exports.INDICATE = INDICATE;
exports.OMISSION = OMISSION;
exports.QUESTION = QUESTION;

exports.Reporter = Reporter;

},{"../constants.js":2}],36:[function(require,module,exports){
const { COMMENT, HUMAN_INDEXING, UNPARSED } = require('../constants.js');
const { DISPLAY, EMPHASIZE, INDICATE, OMISSION, QUESTION, Reporter } = require('./reporter.js');

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';

const BLACK = '\x1b[30m';
const BRIGHT_BLACK = '\x1b[90m';
const WHITE = '\x1b[37m';
const BRIGHT_WHITE = '\x1b[97m';

const BRIGHT_BLACK_BACKGROUND = '\x1b[40m';
const BRIGHT_RED_BACKGROUND = '\x1b[101m';
const WHITE_BACKGROUND = '\x1b[47m';

const INDICATORS = {
  [DISPLAY]: ' ',
  [EMPHASIZE]: '>',
  [INDICATE]: '*',
  [QUESTION]: '?'
};

const GUTTER_STYLE = {
  [DISPLAY]: BRIGHT_BLACK_BACKGROUND,
  [EMPHASIZE]: BLACK + BRIGHT_RED_BACKGROUND,
  [INDICATE]: BLACK + WHITE_BACKGROUND,
  [QUESTION]: BLACK + WHITE_BACKGROUND
};

const RANGE_STYLE = {
  'elementOperator': WHITE,
  'escapeBeginOperator': WHITE,
  'escapeEndOperator': WHITE,
  'itemOperator': WHITE,
  'entryOperator': WHITE,
  'sectionOperator': WHITE,
  'copyOperator': WHITE,
  'deepCopyOperator': WHITE,
  'multilineFieldOperator': WHITE,
  'directLineContinuationOperator': WHITE,
  'spacedLineContinuationOperator': WHITE,
  'key': BOLD + BRIGHT_WHITE,
  'template': BOLD + BRIGHT_WHITE,
  'value': DIM + WHITE
};

class TerminalReporter extends Reporter {
  constructor(context) {
    super(context);

    let highestShownLineNumber = this._snippet.length;

    for(let index = this._snippet.length; index >= 0; index--) {
      if(this._snippet[index] !== undefined && this._snippet[index] !== OMISSION) {
        highestShownLineNumber = index + 1;
        break;
      }
    }

    this._lineNumberPadding = Math.max(4, highestShownLineNumber.toString().length);  // TODO: Pick this up in other reporters
    this._header = '';

    if(context.source) {
      this._header += `${BLACK + BRIGHT_RED_BACKGROUND} ${INDICATORS[EMPHASIZE]} ${' '.padStart(this._lineNumberPadding)} ${RESET} ${BOLD}${context.source}${RESET}\n`;
    }
  }

  _line(line, tag) {
    if(tag === OMISSION)
      return `${DIM + BRIGHT_BLACK_BACKGROUND}${'...'.padStart(this._lineNumberPadding + 2)}  ${RESET}`;

    const number = (line + HUMAN_INDEXING).toString();
    const instruction = this._index[line];

    let content = '';
    if(instruction !== undefined) {
      if(instruction.type === COMMENT || instruction.type === UNPARSED) {
        content = BRIGHT_BLACK + this._context._input.substring(instruction.ranges.line[0], instruction.ranges.line[1]) + RESET;
      } else {
        content = this._context._input.substring(instruction.ranges.line[0], instruction.ranges.line[1]);

        const ranges = Object.entries(instruction.ranges).filter(([name, _]) => name !== 'line');

        ranges.sort((a,b) => a[1][0] < b[1][0] ? 1 : -1);

        for(const [name, range] of ranges) {
          const before = content.substring(0, range[0] - instruction.ranges.line[0]);
          const after = content.substring(range[1] - instruction.ranges.line[0]);

          content = before + RANGE_STYLE[name] + this._context._input.substring(range[0], range[1]) + RESET + after;
        }
      }
    }

    return `${GUTTER_STYLE[tag]} ${INDICATORS[tag]} ${number.padStart(this._lineNumberPadding)} ${RESET} ${content}`;
  }

  _print() {
    const snippet = this._snippet.map((tag, line) => this._line(line, tag))
                                 .filter(line => line !== undefined)
                                 .join('\n');

    return this._header + snippet;
  }
}

exports.TerminalReporter = TerminalReporter;

},{"../constants.js":2,"./reporter.js":35}],37:[function(require,module,exports){
const { DISPLAY, EMPHASIZE, INDICATE, OMISSION, QUESTION, Reporter } = require('./reporter.js');
const { HUMAN_INDEXING } = require('../constants.js');

const INDICATORS = {
  [DISPLAY]: ' ',
  [EMPHASIZE]: '>',
  [INDICATE]: '*',
  [QUESTION]: '?'
};

class TextReporter extends Reporter {
  constructor(context) {
    super(context);

    const gutterHeader = this._context.messages.gutterHeader.padStart(5);
    const columnsHeader = `  ${gutterHeader} | ${this._context.messages.contentHeader}`;

    this._gutterWidth = gutterHeader.length + 3;
    this._header = `${context.source ? `-- ${context.source} --\n\n` : ''}${columnsHeader}\n`;
  }

  _line(line, tag) {
    if(tag === OMISSION)
      return `${' '.repeat(this._gutterWidth - 5)}...`;

    const number = (line + HUMAN_INDEXING).toString();
    const instruction = this._index[line];

    let content;
    if(instruction === undefined) {
      content = '';
    }  else {
      content = this._context._input.substring(instruction.ranges.line[0], instruction.ranges.line[1]);
    }

    return ` ${INDICATORS[tag]}${number.padStart(this._gutterWidth - 3)} | ${content}`;
  }

  _print() {
    const snippet = this._snippet.map((tag, line) => this._line(line, tag))
                                 .filter(line => line !== undefined)
                                 .join('\n');

    return this._header + snippet;
  }
}

exports.TextReporter = TextReporter;

},{"../constants.js":2,"./reporter.js":35}],38:[function(require,module,exports){
const { errors } = require('./errors/parsing.js');
const {
  FIELD,
  FIELDSET,
  FIELD_OR_FIELDSET_OR_LIST,
  LIST,
  MULTILINE_FIELD_BEGIN,
  SECTION
} = require('./constants.js');

const consolidateNonSectionElements = (context, element, template) => {
  if(template.hasOwnProperty('comments') && !element.hasOwnProperty('comments')) {
    element.comments = template.comments;
  }

  if(element.type === FIELD_OR_FIELDSET_OR_LIST) {
    if(template.type === MULTILINE_FIELD_BEGIN) {
      element.type = FIELD;  // TODO: Revisit this - maybe should be MULTILINE_FIELD_COPY or something else - consider implications all around.
      mirror(element, template);
    } else if(template.type === FIELD) {
      element.type = FIELD;
      mirror(element, template);
    } else if(template.type === FIELDSET) {
      element.type = FIELDSET;
      mirror(element, template);
    } else if(template.type === LIST) {
      element.type = LIST;
      mirror(element, template);
    }
  } else if(element.type === FIELDSET) {
    if(template.type === FIELDSET) {
      element.extend = template;
    } else if(template.type === FIELD ||
              template.type === LIST ||
              template.type === MULTILINE_FIELD_BEGIN) {
      throw errors.missingFieldsetForFieldsetEntry(context, element.entries[0]);
    }
  } else if(element.type === LIST) {
    if(template.type === LIST) {
      element.extend = template;
    } else if(template.type === FIELD ||
              template.type === FIELDSET ||
              template.type === MULTILINE_FIELD_BEGIN) {
      throw errors.missingListForListItem(context, element.items[0]);
    }
  }
};

const consolidateSections = (context, section, template, deepMerge) => {
  if(template.hasOwnProperty('comments') && !section.hasOwnProperty('comments')) {
    section.comments = template.comments;
  }

  if(section.elements.length === 0) {
    mirror(section, template);
  } else {
    // TODO: Handle possibility of two templates (one hardcoded in the document, one implicitly derived through deep merging)
    //       Possibly also elswhere (e.g. up there in the mirror branch?)
    section.extend = template;

    if(!deepMerge) return;

    const mergeMap = {};

    for(const elementInstruction of section.elements) {
      if(elementInstruction.type !== SECTION || mergeMap.hasOwnProperty(elementInstruction.key)) {
        mergeMap[elementInstruction.key] = false; // non-mergable (no section or multiple sections with same key)
      } else {
        mergeMap[elementInstruction.key] = { section: elementInstruction };
      }
    }

    for(const elementInstruction of template.elements) {
      if(mergeMap.hasOwnProperty(elementInstruction.key)) {
        const merger = mergeMap[elementInstruction.key];

        if(merger === false) continue;

        if(elementInstruction.type !== SECTION || merger.hasOwnProperty('template')) {
          mergeMap[elementInstruction.key] = false; // non-mergable (no section or multiple template sections with same key)
        } else {
          merger.template = elementInstruction;
        }
      }
    }

    for(const merger of Object.values(mergeMap)) {
      if(merger === false) continue;
      // TODO: merger.template can be undefined if a section is applicable for
      //       merging but no matching merge template is present? (see python impl.)
      //       Note: No spec in js impl. reported this so far, unlike in python impl.
      consolidateSections(context, merger.section, merger.template, true);
    }
  }
};

const mirror = (element, template) => {
  if(template.hasOwnProperty('mirror')) {
    element.mirror = template.mirror;
  } else {
    element.mirror = template;
  }
}

const resolveNonSectionElement = (context, element, previousElements = []) => {
  if(previousElements.includes(element))
    throw errors.cyclicDependency(context, element, previousElements);

  const template = element.copy.template;

  if(template.hasOwnProperty('copy')) { // TODO: Maybe we change that to .unresolved everywhere ?
    resolveNonSectionElement(context, template, [...previousElements, element]);
  }

  consolidateNonSectionElements(context, element, template);

  delete element.copy;
};

const resolveSection = (context, section, previousSections = []) => {
  if(previousSections.includes(section))
    throw errors.cyclicDependency(context, section, previousSections);

  if(section.hasOwnProperty('deepResolve')) {
    for(const elementInstruction of section.elements) {
      if(elementInstruction.type === SECTION && (elementInstruction.hasOwnProperty('copy') || elementInstruction.hasOwnProperty('deepResolve'))) {
        resolveSection(context, elementInstruction, [...previousSections, section]);
      }
    }

    delete section.deepResolve;
  }

  if(section.hasOwnProperty('copy')) {
    const template = section.copy.template;

    if(template.hasOwnProperty('copy') || template.hasOwnProperty('deepResolve')) {
      resolveSection(context, template, [...previousSections, section]);
    }

    consolidateSections(context, section, template, section.deepCopy);

    delete section.copy;
  }
};

const index = (context, section, indexNonSectionElements, indexSections) => {
  for(const elementInstruction of section.elements) {
    if(elementInstruction.type === SECTION) {
      index(context, elementInstruction, indexNonSectionElements, indexSections);

      if(indexSections &&
         context.copy.sections.hasOwnProperty(elementInstruction.key) &&
         elementInstruction.key !== elementInstruction.template) {
        const copyData = context.copy.sections[elementInstruction.key];

        if(copyData.hasOwnProperty('template'))
          throw errors.twoOrMoreTemplatesFound(context, copyData.targets[0], copyData.template, elementInstruction);

        copyData.template = elementInstruction;
      }
    } else if(indexNonSectionElements &&
              context.copy.nonSectionElements.hasOwnProperty(elementInstruction.key) &&
              elementInstruction.key !== elementInstruction.template) {
      const copyData = context.copy.nonSectionElements[elementInstruction.key];

      if(copyData.hasOwnProperty('template'))
        throw errors.twoOrMoreTemplatesFound(context, copyData.targets[0], copyData.template, elementInstruction);

      copyData.template = elementInstruction;
    }
  }
}

exports.resolve = function() {
  const unresolvedNonSectionElements = Object.values(this.copy.nonSectionElements);
  const unresolvedSections = Object.values(this.copy.sections);

  if(unresolvedNonSectionElements.length > 0 || unresolvedSections.length > 0) {
    index(this, this._document, unresolvedNonSectionElements.length > 0, unresolvedSections.length > 0);

    for(const copy of unresolvedNonSectionElements) {
      if(!copy.hasOwnProperty('template'))
        throw errors.nonSectionElementNotFound(this, copy.targets[0]);

      for(const target of copy.targets) {
        if(!target.hasOwnProperty('copy')) continue;

        resolveNonSectionElement(this, target);
      }
    }

    for(const copy of unresolvedSections) {
      if(!copy.hasOwnProperty('template'))
        throw errors.sectionNotFound(this, copy.targets[0]);

      for(const target of copy.targets) {
        if(!target.hasOwnProperty('copy')) continue;

        resolveSection(this, target);
      }
    }
  }

  delete this.copy;
};

},{"./constants.js":2,"./errors/parsing.js":25}]},{},[31]);
