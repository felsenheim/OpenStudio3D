// three.js 0.187 for MindAR 1.2.5.
// MindAR's three build still imports `sRGBEncoding`, which three removed in r162;
// a missing named export stops the whole module from loading. This file passes
// everything through from three and adds the old constant back. MindAR only
// assigns it to `renderer.outputEncoding`, which current three ignores
// (output is sRGB by default). The import map in ar/index.html points only
// MindAR's "three" here; all other code imports three directly.
export * from 'three';
export const sRGBEncoding = 3001;
