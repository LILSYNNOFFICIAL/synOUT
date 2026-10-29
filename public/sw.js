/**
 * Copyright 2018 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// If the loader is already loaded, just stop.
if (!self.define) {
  let registry = {};

  // Used for `eval` and `importScripts` where we can't get script URL by other means.
  // In both cases, it's safe to use a global var because those functions are synchronous.
  let nextDefineUri;

  const singleRequire = (uri, parentUri) => {
    uri = new URL(uri + ".js", parentUri).href;
    return registry[uri] || (
      
        new Promise(resolve => {
          if ("document" in self) {
            const script = document.createElement("script");
            script.src = uri;
            script.onload = resolve;
            document.head.appendChild(script);
          } else {
            nextDefineUri = uri;
            importScripts(uri);
            resolve();
          }
        })
      
      .then(() => {
        let promise = registry[uri];
        if (!promise) {
          throw new Error(`Module ${uri} didn’t register its module`);
        }
        return promise;
      })
    );
  };

  self.define = (depsNames, factory) => {
    const uri = nextDefineUri || ("document" in self ? document.currentScript.src : "") || location.href;
    if (registry[uri]) {
      // Module is already loading or loaded.
      return;
    }
    let exports = {};
    const require = depUri => singleRequire(depUri, uri);
    const specialDeps = {
      module: { uri },
      exports,
      require
    };
    registry[uri] = Promise.all(depsNames.map(
      depName => specialDeps[depName] || require(depName)
    )).then(deps => {
      factory(...deps);
      return exports;
    });
  };
}
define(['./workbox-afac4cd2'], (function (workbox) { 'use strict';

  self.skipWaiting();
  workbox.clientsClaim();
  /**
   * The precacheAndRoute() method efficiently caches and responds to
   * requests for URLs in the manifest.
   * See https://goo.gl/S9QRab
   */
  workbox.precacheAndRoute([{
    "url": "synout-logo.svg",
    "revision": "938b27a8e98acb412b2c4194011101bf"
  }, {
    "url": "registerSW.js",
    "revision": "66fe642968a2fe8cc850b53c7c0661ff"
  }, {
    "url": "pwa-maskable-512x512.png",
    "revision": "37bd94c24d235d221778cbd153c23ae9"
  }, {
    "url": "pwa-512x512.png",
    "revision": "f6db4a812948e639e77c4f684c80f3df"
  }, {
    "url": "pwa-192x192.png",
    "revision": "f7795cecf55bb18fab6a69e7ef981501"
  }, {
    "url": "index.html",
    "revision": "af47de48c4e183454a8f655befc4a2e5"
  }, {
    "url": "apple-touch-icon.png",
    "revision": "dd56d852d69843c937ef28767ad4e584"
  }, {
    "url": "assets/purify.es-BZxk_wWO.js",
    "revision": null
  }, {
    "url": "assets/index.es-BcGZ2bJB.js",
    "revision": null
  }, {
    "url": "assets/index-DqseiOlh.css",
    "revision": null
  }, {
    "url": "assets/index-CiqwCUrQ.js",
    "revision": null
  }, {
    "url": "apple-touch-icon.png",
    "revision": "dd56d852d69843c937ef28767ad4e584"
  }, {
    "url": "pwa-192x192.png",
    "revision": "f7795cecf55bb18fab6a69e7ef981501"
  }, {
    "url": "pwa-512x512.png",
    "revision": "f6db4a812948e639e77c4f684c80f3df"
  }, {
    "url": "pwa-maskable-512x512.png",
    "revision": "37bd94c24d235d221778cbd153c23ae9"
  }, {
    "url": "synout-logo.svg",
    "revision": "938b27a8e98acb412b2c4194011101bf"
  }, {
    "url": "site.webmanifest",
    "revision": "fa03f9711e5d8abd13303d0e37ea90fb"
  }], {});
  workbox.cleanupOutdatedCaches();
  workbox.registerRoute(new workbox.NavigationRoute(workbox.createHandlerBoundToURL("index.html"), {
    denylist: [/^\/api\//]
  }));
  workbox.registerRoute(/^https:\/\/fonts\.googleapis\.com\/.*/i, new workbox.CacheFirst({
    "cacheName": "google-fonts-cache",
    plugins: [new workbox.ExpirationPlugin({
      maxEntries: 10,
      maxAgeSeconds: 31536000
    }), new workbox.CacheableResponsePlugin({
      statuses: [0, 200]
    })]
  }), 'GET');
  workbox.registerRoute(/^https:\/\/fonts\.gstatic\.com\/.*/i, new workbox.CacheFirst({
    "cacheName": "gstatic-fonts-cache",
    plugins: [new workbox.ExpirationPlugin({
      maxEntries: 10,
      maxAgeSeconds: 31536000
    }), new workbox.CacheableResponsePlugin({
      statuses: [0, 200]
    })]
  }), 'GET');

}));
