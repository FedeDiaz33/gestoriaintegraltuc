/* analytics-init.js — GTM + gtag.js
   Antes eran <script> en línea dentro de index.html (la CSP los bloquea sin 'unsafe-inline').
   Mismo código, mismos IDs, ahora en un archivo propio servido desde 'self'.
   El <script async src=".../gtag/js?id=G-GWQKTPTSVN"> sigue en index.html. */

/* Google Tag Manager */
(function (w, d, s, l, i) {
  w[l] = w[l] || [];
  w[l].push({ "gtm.start": new Date().getTime(), event: "gtm.js" });
  var f = d.getElementsByTagName(s)[0],
    j = d.createElement(s),
    dl = l != "dataLayer" ? "&l=" + l : "";
  j.async = true;
  j.src = "https://www.googletagmanager.com/gtm.js?id=" + i + dl;
  f.parentNode.insertBefore(j, f);
})(window, document, "script", "dataLayer", "GTM-PHHS7WM");

/* Google tag (gtag.js) */
window.dataLayer = window.dataLayer || [];
function gtag() {
  dataLayer.push(arguments);
}
gtag("js", new Date());
gtag("config", "G-GWQKTPTSVN");
