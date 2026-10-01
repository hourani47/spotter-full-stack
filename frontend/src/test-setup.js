// Leaflet draws the route as SVG and decides whether it can when it is first
// imported. jsdom has SVG elements but not this method, which is all it checks.
if (!SVGSVGElement.prototype.createSVGRect) {
  SVGSVGElement.prototype.createSVGRect = () => ({ x: 0, y: 0, width: 0, height: 0 })
}
