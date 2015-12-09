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