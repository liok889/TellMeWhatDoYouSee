/* --------------------------------------------
 * Utils
 * ============================================
 */

// returns the SVG node starting from an element within
function getSVG(element)
{
	if (element.nodeName.toUpperCase() === "SVG") {
		return element;
	}
	else {
		return getSVG(element.parentElement);
	}
}

function emptyOrNullString(str)
{
	if (!str) return ""; else return str;
}

function getParentElement(element, parent, className)
{
	if (
		(element.nodeName.toUpperCase() === parent.toUpperCase())
		&& (!className || className.toUpperCase() === (emptyOrNullString(d3.select(element).attr("class"))).toUpperCase())
	) {
		return element;
	}
	else {
		return getParentElement(element.parentElement, parent, className);
	}
}


function putNodeOnTop(node)
{
	var n = jQuery(node);
	n.parent().append(n.detach());
}

// left: 37, up: 38, right: 39, down: 40,
// spacebar: 32, pageup: 33, pagedown: 34, end: 35, home: 36
var keys = {37: 1, 38: 1, 39: 1, 40: 1};

function preventDefault(e) {
  e = e || window.event;
  if (e.preventDefault)
      e.preventDefault();
  e.returnValue = false;  
}

function preventDefaultForScrollKeys(e) {
    if (keys[e.keyCode]) {
        preventDefault(e);
        return false;
    }
}

function disableScroll() {
  if (window.addEventListener) // older FF
      window.addEventListener('DOMMouseScroll', preventDefault, false);
  window.onwheel = preventDefault; // modern standard
  window.onmousewheel = document.onmousewheel = preventDefault; // older browsers, IE
  window.ontouchmove  = preventDefault; // mobile
  document.onkeydown  = preventDefaultForScrollKeys;
}

function enableScroll() {
    if (window.removeEventListener)
        window.removeEventListener('DOMMouseScroll', preventDefault, false);
    window.onmousewheel = document.onmousewheel = null; 
    window.onwheel = null; 
    window.ontouchmove = null;  
    document.onkeydown = null;  
}

function isInteger(x) {
  return x % 1 === 0;
}

function activateButtons(buttonCallbacks, padding)
{
  // active buttons
    for (var i=0, N=buttonCallbacks.length; i<N; i++) {
      var b = buttonCallbacks[i];
      d3.select("#" + b.id)
        .style("padding", padding || "2px")
        .on("click", b.callback || null)
        .on("dblclick", b.dblCallback || null)
        .on("mouseover", function() { 
          d3.select(this)
            .style("border", "solid 1.5px red"); 
        })
        .on("mouseout", function() { d3.select(this).style("border", "")});
    }
}

function getCoords(elem) { // crossbrowser version
    var box = elem.getBoundingClientRect();

    var body = document.body;
    var docEl = document.documentElement;

    var scrollTop = window.pageYOffset || docEl.scrollTop || body.scrollTop;
    var scrollLeft = window.pageXOffset || docEl.scrollLeft || body.scrollLeft;

    var clientTop = docEl.clientTop || body.clientTop || 0;
    var clientLeft = docEl.clientLeft || body.clientLeft || 0;

    var top  = box.top +  scrollTop - clientTop;
    var left = box.left + scrollLeft - clientLeft;

    return { top: Math.round(top), left: Math.round(left) };
}
