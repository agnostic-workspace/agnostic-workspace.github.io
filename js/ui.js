


var ui = {};

ui.workspaceDiv = $("#workspace")[0];



/* TWEAKPANE MAIN */

ui.main = new Tweakpane.Pane({
    container: ui.workspaceDiv,
    expanded: true
});

ui.main.registerPlugin(TweakpaneEssentialsPlugin);
ui.main.registerPlugin(TweakpaneTextareaPlugin);


/* EDITOR */

ui.editorInterface = {
    eno: ''
};

ui.editorFolder = ui.main.addFolder({
    title: "Code Editor",
    expanded: false
});

ui.editor = ui.editorFolder.addInput(ui.editorInterface, "eno", {
    view: "textarea",
    lineCount: 25,
    placeholder: ''
});

$("textarea").attr("id", "editor");


setTimeout(function() {
    ui.ace = ace.edit("editor", {
        fontSize: "12px",
        autoScrollEditorIntoView: true,
        useSoftTabs: true,
        navigateWithinSoftTabs: true,
        scrollPastEnd: true,
        showGutter: false
    });
    ui.ace.setOptions({ fontFamily: "RobotoMono" });
    ui.ace.setTheme("ace/theme/clouds_midnight");
    ui.ace.session.setMode("ace/mode/eno");

    setTimeout(function() {
        $(".ace_editor").click(function() {
            ui.ace.resize();
        });    
    }, 10);
    
}, 10);





/* JS CONSOLE */

ui.jsConsoleFolder = ui.main.addFolder({
    title: "JS Console",
    expanded: true
});

ui.jsConsoleInterface = {
    input: '',
    output: '',
    error: '',
};

ui.output = ui.jsConsoleFolder.addMonitor(ui.jsConsoleInterface, "output", {
    multiline: true,
    lineCount: 25
});

ui.input = ui.jsConsoleFolder.addInput(ui.jsConsoleInterface, "input");

ui.main.addSeparator();

ui.error = ui.main.addMonitor(ui.jsConsoleInterface, "error", {
    multiline: true,
    lineCount: 15
});



/* LOGGER */

function log() {

    let content = Array.from(arguments).map(c => treeify.asTree({ [new Date().toTimeString()]: c }, true)).join('\n');
    if (content.length) content += '\n';
    ui.jsConsoleInterface.output += content;

    console.log.apply(null, [...arguments]);
}



/* EVAL INPUT */

ui.input.on("change", function(e) {

    log({
        input: e.value,
        value: eval(e.value)
    });
    console.log(e)
})



/* SHOWING ERRORS */

window.onerror = function(message, source, lineno, colno, error) {

    let stack = error.stack.split('\n').filter(line => line.length).map(line => "    ↑ "+line).join('\n');
    let time = (new Date()).toLocaleTimeString();
    ui.jsConsoleInterface.error += `⚠️ \n[${time}] ${message}\n${stack}\n`;
}



