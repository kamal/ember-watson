var fs       = require('fs');
var recast   = require('recast');
var builders = recast.types.builders;

function isModule(node) {
  return node.expression.type === 'CallExpression' &&
    node.expression.callee.name === 'module';
}

function isTest(node) {
  return node.expression.type === 'CallExpression' &&
    node.expression.callee.name === 'test';
}

function isImportEmberQunit(node) {
  return node.source.type === 'ModuleSpecifier' &&
    node.source.value === 'ember-qunit';
}

function transformModule(node) {
  var callExpression = node.expression;
  if (callExpression.arguments.length > 1 &&
      callExpression.arguments[1].type === 'ObjectExpression') {
    callExpression.arguments[1].properties.forEach(function(node) {
      if (node.key.name === 'setup') {
        node.key.name = 'beforeEach';
      }
      if (node.key.name === 'teardown') {
        node.key.name = 'afterEach';
      }
    });
  }
}

function transformTestStatement(node) {
  if (node.expression.arguments.length > 1) {
    var callback = node.expression.arguments[1];

    if (callback.type === 'FunctionExpression') {
      if (callback.params.length === 0) {
        callback.params.push(builders.identifier('assert'));
      }
    }
  }
}

function addEmberQunitImport(ast) {
  var firstImport = ast.program.body.shift();

  var emberQUnitImport = builders.importDeclaration(
    [
      builders.importSpecifier(builders.identifier('module')),
      builders.importSpecifier(builders.identifier('test'))
    ],
    builders.moduleSpecifier('ember-qunit')
  );

  ast.program.body.unshift(emberQUnitImport);
  ast.program.body.unshift(firstImport);
}


module.exports = function transform(source) {
  var sections = {
    hasEmberQunit: false,
    modules: [],
    tests: []
  };

  var ast = recast.parse(source);

  recast.visit(ast, {
    visitExpressionStatement: function(path) {
      var node = path.node;

      if (isModule(node)) {
        sections.modules.push(node);
      }

      if (isTest(node)) {
        sections.tests.push(node);
      }
      this.traverse(path);
    },
    visitImportDeclaration: function(path) {

      if (isImportEmberQunit(path.node)) {
        sections.hasEmberQunit = true;
      }

      this.traverse(path);
    }
  });

  sections.modules.forEach(function(qunitModule) {
    transformModule(qunitModule);
  });

  sections.tests.forEach(function(node) {
    transformTestStatement(node);
  });

  if (!sections.hasEmberQunit) {
    addEmberQunitImport(ast);
  }

  var newCode = recast.print(ast, { tabWidth: 2, quote: 'single' }).code;

  return newCode;
}