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

function putNodeOnTop(node)
{
	var n = jQuery(node);
	n.parent().append(n.detach());
}