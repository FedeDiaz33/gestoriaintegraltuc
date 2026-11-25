/* metricool-init.js — tracker de Metricool
   Antes era un <script> en línea al pie de index.html. Mismo código, ahora en archivo propio. */
function loadScript(a) {
  var b = document.getElementsByTagName("head")[0],
    c = document.createElement("script");
  c.type = "text/javascript";
  c.src = "https://tracker.metricool.com/resources/be.js";
  c.onreadystatechange = a;
  c.onload = a;
  b.appendChild(c);
}
loadScript(function () {
  beTracker.t({ hash: "7edc12aa754357e21a6b7936b41f6427" });
});
