EPUBJS.Hooks.register("beforeChapterDisplay").highlight = function(callback, renderer){

    // EPUBJS.core.addScript("js/libs/jquery.highlight.js", null, renderer.doc.head);

    var s = document.createElement("style");
    // Search highlight (match color requested)
    s.innerHTML =".highlight { background: #f000ff; font-weight: normal; }";
    
    renderer.render.document.head.appendChild(s);
    
    if(callback) callback();

}

