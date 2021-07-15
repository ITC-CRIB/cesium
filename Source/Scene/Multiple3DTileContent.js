import defined from "../Core/defined.js";
import destroyObject from "../Core/destroyObject.js";
import DeveloperError from "../Core/DeveloperError.js";
import Request from "../Core/Request.js";
import RequestScheduler from "../Core/RequestScheduler.js";
import RequestState from "../Core/RequestState.js";
import RequestType from "../Core/RequestType.js";
import RuntimeError from "../Core/RuntimeError.js";
import when from "../ThirdPartyNpm/when.js";
import Cesium3DTileContentType from "./Cesium3DTileContentType.js";
import Cesium3DTileContentFactory from "./Cesium3DTileContentFactory.js";
import findGroupMetadata from "./findGroupMetadata.js";
import preprocess3DTileContent from "./preprocess3DTileContent.js";

/**
 * A collection of contents for tiles that use the <code>3DTILES_multiple_contents</code> extension.
 * <p>
 * Implements the {@link Cesium3DTileContent} interface.
 * </p>
 *
 * @see {@link https://github.com/CesiumGS/3d-tiles/tree/3d-tiles-next/extensions/3DTILES_multiple_contents/0.0.0|3DTILES_multiple_contents extension}
 *
 * @alias Multiple3DTileContent
 * @constructor
 *
 * @param {Cesium3DTileset} tileset The tileset this content belongs to
 * @param {Cesium3DTile} tile The content this content belongs to
 * @param {Resource} tilesetResource The resource that points to the tileset. This will be used to derive each inner content's resource.
 * @param {Object} extensionJson The <code>3DTILES_multiple_contents</code> extension JSON
 *
 * @private
 * @experimental This feature is using part of the 3D Tiles spec that is not final and is subject to change without Cesium's standard deprecation policy.
 */
export default function Multiple3DTileContent(
  tileset,
  tile,
  tilesetResource,
  extensionJson
) {
  this._tileset = tileset;
  this._tile = tile;
  this._tilesetResource = tilesetResource;
  this._contents = [];

  var contentHeaders = extensionJson.content;
  this._innerContentHeaders = contentHeaders;
  this._requestsInFlight = 0;

  // How many times cancelPendingRequests() has been called. This is
  // used to help short-circuit computations after a tile was canceled.
  this._cancelCount = 0;

  var contentCount = this._innerContentHeaders.length;
  this._arrayFetchPromises = new Array(contentCount);
  this._requests = new Array(contentCount);

  this._innerContentResources = new Array(contentCount);
  this._serverKeys = new Array(contentCount);

  for (var i = 0; i < contentCount; i++) {
    var contentResource = tilesetResource.getDerivedResource({
      url: contentHeaders[i].uri,
    });

    var serverKey = RequestScheduler.getServerKey(
      contentResource.getUrlComponent()
    );

    this._innerContentResources[i] = contentResource;
    this._serverKeys[i] = serverKey;
  }

  // undefined until the first time requests are scheduled
  this._contentsFetchedPromise = undefined;
  this._readyPromise = when.defer();
}

Object.defineProperties(Multiple3DTileContent.prototype, {
  /**
   * Part of the {@link Cesium3DTileContent} interface.  <code>Multiple3DTileContent</code> checks if any of the inner contents have dirty featurePropertiesDirty.
   * @memberof Multiple3DTileContent.prototype
   *
   * @type {Boolean}
   *
   * @private
   */
  featurePropertiesDirty: {
    get: function () {
      var contents = this._contents;
      var length = contents.length;
      for (var i = 0; i < length; ++i) {
        if (contents[i].featurePropertiesDirty) {
          return true;
        }
      }

      return false;
    },
    set: function (value) {
      var contents = this._contents;
      var length = contents.length;
      for (var i = 0; i < length; ++i) {
        contents[i].featurePropertiesDirty = value;
      }
    },
  },

  /**
   * Part of the {@link Cesium3DTileContent} interface.  <code>Multiple3DTileContent</code>
   * always returns <code>0</code>.  Instead call <code>featuresLength</code> for a specific inner content.
   * @memberof Multiple3DTileContent.prototype
   * @private
   */
  featuresLength: {
    get: function () {
      return 0;
    },
  },

  /**
   * Part of the {@link Cesium3DTileContent} interface.  <code>Multiple3DTileContent</code>
   * always returns <code>0</code>.  Instead, call <code>pointsLength</code> for a specific inner content.
   * @memberof Multiple3DTileContent.prototype
   * @private
   */
  pointsLength: {
    get: function () {
      return 0;
    },
  },

  /**
   * Part of the {@link Cesium3DTileContent} interface.  <code>Multiple3DTileContent</code>
   * always returns <code>0</code>.  Instead call <code>trianglesLength</code> for a specific inner content.
   * @memberof Multiple3DTileContent.prototype
   * @private
   */
  trianglesLength: {
    get: function () {
      return 0;
    },
  },

  /**
   * Part of the {@link Cesium3DTileContent} interface.  <code>Multiple3DTileContent</code>
   * always returns <code>0</code>.  Instead call <code>geometryByteLength</code> for a specific inner content.
   * @memberof Multiple3DTileContent.prototype
   * @private
   */
  geometryByteLength: {
    get: function () {
      return 0;
    },
  },

  /**
   * Part of the {@link Cesium3DTileContent} interface.   <code>Multiple3DTileContent</code>
   * always returns <code>0</code>.  Instead call <code>texturesByteLength</code> for a specific inner content.
   * @memberof Multiple3DTileContent.prototype
   * @private
   */
  texturesByteLength: {
    get: function () {
      return 0;
    },
  },

  /**
   * Part of the {@link Cesium3DTileContent} interface.  <code>Multiple3DTileContent</code>
   * always returns <code>0</code>.  Instead call <code>batchTableByteLength</code> for a specific inner content.
   * @memberof Multiple3DTileContent.prototype
   * @private
   */
  batchTableByteLength: {
    get: function () {
      return 0;
    },
  },

  innerContents: {
    get: function () {
      return this._contents;
    },
  },

  readyPromise: {
    get: function () {
      return this._readyPromise.promise;
    },
  },

  tileset: {
    get: function () {
      return this._tileset;
    },
  },

  tile: {
    get: function () {
      return this._tile;
    },
  },

  /**
   * Part of the {@link Cesium3DTileContent} interface.
   * Unlike other content types, <code>Multiple3DTileContent</code> does not
   * have a single URL, so this returns undefined.
   * @memberof Multiple3DTileContent.prototype
   *
   * @type {String}
   * @readonly
   * @private
   */
  url: {
    get: function () {
      return undefined;
    },
  },

  /**
   * Part of the {@link Cesium3DTileContent} interface. <code>Multiple3DTileContent</code>
   * always returns <code>undefined</code>.  Instead call <code>batchTable</code> for a specific inner content.
   * @memberof Multiple3DTileContent.prototype
   * @private
   */
  batchTable: {
    get: function () {
      return undefined;
    },
  },

  /**
   * Part of the {@link Cesium3DTileContent} interface. <code>Multiple3DTileContent</code>
   * always returns <code>undefined</code>.  Instead call <code>groupMetadata</code> for a specific inner content.
   * @memberof Multiple3DTileContent.prototype
   * @private
   */
  groupMetadata: {
    get: function () {
      return undefined;
    },
    set: function () {
      throw new DeveloperError(
        "Multiple3DTileContent cannot have group metadata"
      );
    },
  },

  /**
   * Get an array of the inner content URLs, regardless of whether they've
   * been fetched or not. This is intended for use with
   * {@link Cesium3DTileset#debugShowUrl}.
   * @memberof Multiple3DTileContent.prototype
   *
   * @type {String[]}
   * @readonly
   * @private
   */
  innerContentUrls: {
    get: function () {
      return this._innerContentHeaders.map(function (contentHeader) {
        return contentHeader.uri;
      });
    },
  },

  /**
   * A promise that resolves when all of the inner contents have been fetched.
   * This promise is undefined until the first frame where all array buffer
   * requests have been scheduled.
   * @memberof Multiple3DTileContent.prototype
   *
   * @type {Promise}
   * @private
   */
  contentsFetchedPromise: {
    get: function () {
      if (defined(this._contentsFetchedPromise)) {
        return this._contentsFetchedPromise.promise;
      }

      return undefined;
    },
  },
});

function updatePendingRequests(multipleContents, deltaRequestCount) {
  multipleContents._requestsInFlight += deltaRequestCount;
  multipleContents.tileset.statistics.numberOfPendingRequests += deltaRequestCount;
}

function cancelPendingRequests(multipleContents, originalContentState) {
  multipleContents._cancelCount++;

  // reset the tile's content state to try again later.
  multipleContents._tile._contentState = originalContentState;

  multipleContents.tileset.statistics.numberOfPendingRequests -=
    multipleContents._requestsInFlight;
  multipleContents._requestsInFlight = 0;

  // Discard the request promises.
  var contentCount = multipleContents._innerContentHeaders.length;
  multipleContents._arrayFetchPromises = new Array(contentCount);
}

/**
 * Request the inner contents of this <code>Multiple3DTileContent</code>. This must be called once a frame until
 * {@link Multiple3DTileContent#contentsFetchedPromise} is defined. This promise
 * becomes available as soon as all requests are scheduled.
 * <p>
 * This method also updates the tile statistics' pending request count if the
 * requests are successfully scheduled.
 * </p>
 *
 * @return {Number} The number of attempted requests that were unable to be scheduled.
 * @private
 */
Multiple3DTileContent.prototype.requestInnerContents = function () {
  // It's possible for these promises to leak content array buffers if the
  // camera moves before they all are scheduled. To prevent this leak, check
  // if we can schedule all the requests at once. If not, no requests are
  // scheduled
  if (!canScheduleAllRequests(this._serverKeys)) {
    return this._serverKeys.length;
  }

  var contentHeaders = this._innerContentHeaders;
  updatePendingRequests(this, contentHeaders.length);

  for (var i = 0; i < contentHeaders.length; i++) {
    // The cancel count is needed to avoid a race condition where a content
    // is canceled multiple times.
    this._arrayFetchPromises[i] = requestInnerContent(
      this,
      i,
      this._cancelCount,
      this._tile._contentState
    );
  }

  // set up the deferred promise the first time requestInnerContent()
  // is called.
  if (!defined(this._contentsFetchedPromise)) {
    this._contentsFetchedPromise = when.defer();
  }

  createInnerContents(this);
  return 0;
};

/**
 * Check if all requests for inner contents can be scheduled at once. This is slower, but it avoids a potential memory leak.
 * @param {String[]} serverKeys The server keys for all of the inner contents
 * @return {Boolean} True if the request scheduler has enough open slots for all inner contents
 * @private
 */
function canScheduleAllRequests(serverKeys) {
  var requestCountsByServer = {};
  for (var i = 0; i < serverKeys.length; i++) {
    var serverKey = serverKeys[i];
    if (defined(requestCountsByServer[serverKey])) {
      requestCountsByServer[serverKey]++;
    } else {
      requestCountsByServer[serverKey] = 1;
    }
  }

  for (var key in requestCountsByServer) {
    if (
      requestCountsByServer.hasOwnProperty(key) &&
      !RequestScheduler.serverHasOpenSlots(key, requestCountsByServer[key])
    ) {
      return false;
    }
  }
  return RequestScheduler.heapHasOpenSlots(serverKeys.length);
}

function requestInnerContent(
  multipleContents,
  index,
  originalCancelCount,
  originalContentState
) {
  // it is important to clone here. The fetchArrayBuffer() below here uses
  // throttling, but other uses of the resources do not.
  var contentResource = multipleContents._innerContentResources[index].clone();
  var tile = multipleContents.tile;

  // Always create a new request. If the tile gets canceled, this
  // avoids getting stuck in the canceled state.
  var priorityFunction = function () {
    return tile._priority;
  };
  var serverKey = multipleContents._serverKeys[index];
  var request = new Request({
    throttle: true,
    throttleByServer: true,
    type: RequestType.TILES3D,
    priorityFunction: priorityFunction,
    serverKey: serverKey,
  });
  contentResource.request = request;
  multipleContents._requests[index] = request;

  return contentResource
    .fetchArrayBuffer()
    .then(function (arrayBuffer) {
      // Short circuit if another inner content was canceled.
      if (originalCancelCount < multipleContents._cancelCount) {
        return undefined;
      }

      updatePendingRequests(multipleContents, -1);
      return arrayBuffer;
    })
    .otherwise(function (error) {
      // Short circuit if another inner content was canceled.
      if (originalCancelCount < multipleContents._cancelCount) {
        return undefined;
      }

      if (contentResource.request.state === RequestState.CANCELLED) {
        cancelPendingRequests(multipleContents, originalContentState);
        return undefined;
      }

      updatePendingRequests(multipleContents, -1);
      handleInnerContentFailed(multipleContents, index, error);
      return undefined;
    });
}

function createInnerContents(multipleContents) {
  var originalCancelCount = multipleContents._cancelCount;
  when
    .all(multipleContents._arrayFetchPromises)
    .then(function (arrayBuffers) {
      if (originalCancelCount < multipleContents._cancelCount) {
        return undefined;
      }

      return arrayBuffers.map(function (arrayBuffer, i) {
        if (!defined(arrayBuffer)) {
          // Content was not fetched. The error was handled in
          // the fetch promise
          return undefined;
        }

        try {
          return createInnerContent(multipleContents, arrayBuffer, i);
        } catch (error) {
          handleInnerContentFailed(multipleContents, i, error);
          return undefined;
        }
      });
    })
    .then(function (contents) {
      if (!defined(contents)) {
        // request was canceled. resolve the promise (Cesium3DTile will
        // detect that the the content was canceled), then discard the promise
        // so a new one can be created
        if (defined(multipleContents._contentsFetchedPromise)) {
          multipleContents._contentsFetchedPromise.resolve();
          multipleContents._contentsFetchedPromise = undefined;
        }
        return;
      }

      multipleContents._contents = contents.filter(defined);
      awaitReadyPromises(multipleContents);

      if (defined(multipleContents._contentsFetchedPromise)) {
        multipleContents._contentsFetchedPromise.resolve();
      }
    })
    .otherwise(function (error) {
      if (defined(multipleContents._contentsFetchedPromise)) {
        multipleContents._contentsFetchedPromise.reject(error);
      }
    });
}

function createInnerContent(multipleContents, arrayBuffer, index) {
  var preprocessed = preprocess3DTileContent(arrayBuffer);

  if (preprocessed.contentType === Cesium3DTileContentType.EXTERNAL_TILESET) {
    throw new RuntimeError(
      "External tilesets are disallowed inside the 3DTILES_multiple_contents extension"
    );
  }

  multipleContents._disableSkipLevelOfDetail =
    multipleContents._disableSkipLevelOfDetail ||
    preprocessed.contentType === Cesium3DTileContentType.GEOMETRY ||
    preprocessed.contentType === Cesium3DTileContentType.VECTOR;

  var tileset = multipleContents._tileset;
  var resource = multipleContents._innerContentResources[index];

  var content;
  var contentFactory = Cesium3DTileContentFactory[preprocessed.contentType];
  if (defined(preprocessed.binaryPayload)) {
    content = contentFactory(
      tileset,
      multipleContents._tile,
      resource,
      preprocessed.binaryPayload.buffer,
      0
    );
  } else {
    // JSON formats
    content = contentFactory(
      tileset,
      multipleContents._tile,
      resource,
      preprocessed.jsonPayload
    );
  }

  var contentHeader = multipleContents._innerContentHeaders[index];
  content.groupMetadata = findGroupMetadata(tileset, contentHeader);
  return content;
}

function awaitReadyPromises(multipleContents) {
  var readyPromises = multipleContents._contents.map(function (content) {
    return content.readyPromise;
  });

  when
    .all(readyPromises)
    .then(function () {
      multipleContents._readyPromise.resolve(multipleContents);
    })
    .otherwise(function (error) {
      multipleContents._readyPromise.reject(error);
    });
}

function handleInnerContentFailed(multipleContents, index, error) {
  var tileset = multipleContents._tileset;
  var url = multipleContents._innerContentResources[index].url;
  var message = defined(error.message) ? error.message : error.toString();
  if (tileset.tileFailed.numberOfListeners > 0) {
    tileset.tileFailed.raiseEvent({
      url: url,
      message: message,
    });
  } else {
    console.log("A content failed to load: " + url);
    console.log("Error: " + message);
  }
}

/**
 * Cancel all requests for inner contents. This is called by the tile
 * when a tile goes out of view.
 *
 * @private
 */
Multiple3DTileContent.prototype.cancelRequests = function () {
  for (var i = 0; i < this._requests.length; i++) {
    var request = this._requests[i];
    if (defined(request)) {
      request.cancel();
    }
  }
};

/**
 * Part of the {@link Cesium3DTileContent} interface.  <code>Multiple3DTileContent</code>
 * always returns <code>false</code>.  Instead call <code>hasProperty</code> for a specific inner content
 * @private
 */
Multiple3DTileContent.prototype.hasProperty = function (batchId, name) {
  return false;
};

/**
 * Part of the {@link Cesium3DTileContent} interface.  <code>Multiple3DTileContent</code>
 * always returns <code>undefined</code>.  Instead call <code>getFeature</code> for a specific inner content
 * @private
 */
Multiple3DTileContent.prototype.getFeature = function (batchId) {
  return undefined;
};

Multiple3DTileContent.prototype.applyDebugSettings = function (enabled, color) {
  var contents = this._contents;
  var length = contents.length;
  for (var i = 0; i < length; ++i) {
    contents[i].applyDebugSettings(enabled, color);
  }
};

Multiple3DTileContent.prototype.applyStyle = function (style) {
  var contents = this._contents;
  var length = contents.length;
  for (var i = 0; i < length; ++i) {
    contents[i].applyStyle(style);
  }
};

Multiple3DTileContent.prototype.update = function (tileset, frameState) {
  var contents = this._contents;
  var length = contents.length;
  for (var i = 0; i < length; ++i) {
    contents[i].update(tileset, frameState);
  }
};

Multiple3DTileContent.prototype.isDestroyed = function () {
  return false;
};

Multiple3DTileContent.prototype.destroy = function () {
  var contents = this._contents;
  var length = contents.length;
  for (var i = 0; i < length; ++i) {
    contents[i].destroy();
  }
  return destroyObject(this);
};
