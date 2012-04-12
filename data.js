//     (c) 2012 Michael Aufreiter
//     Data.js is freely distributable under the MIT license.
//     Portions of Data.js are inspired or borrowed from Underscore.js,
//     Backbone.js and Google's Visualization API.
//     For all details and documentation:
//     http://substance.io/michael/data-js

(function(){

  // Initial Setup
  // -------------

  // The top-level namespace. All public Data.js classes and modules will
  // be attached to this. Exported for both CommonJS and the browser.
  var Data;
  if (typeof exports !== 'undefined') {
    Data = exports;
  } else {
    Data = this.Data = {};
  }
  
  // Current version of the library. Keep in sync with `package.json`.
  Data.VERSION = '0.6.0';

  // Require Underscore, if we're on the server, and it's not already present.
  var _ = this._;
  if (!_ && (typeof require !== 'undefined')) _ = require("underscore");
  
  // Top Level API
  // -------

  Data.VALUE_TYPES = [
    'string',
    'object',
    'number',
    'boolean',
    'date'
  ];


  Data.isValueType = function (type) {
    return _.include(Data.VALUE_TYPES, _.last(type));
  };


  /*!
  Math.uuid.js (v1.4)
  http://www.broofa.com
  mailto:robert@broofa.com

  Copyright (c) 2010 Robert Kieffer
  Dual licensed under the MIT and GPL licenses.
  */

  Data.uuid = function (prefix) {
    var chars = '0123456789abcdefghijklmnopqrstuvwxyz'.split(''),
        uuid = [],
        radix = 16,
        len = 32;

    if (len) {
      // Compact form
      for (var i = 0; i < len; i++) uuid[i] = chars[0 | Math.random()*radix];
    } else {
      // rfc4122, version 4 form
      var r;

      // rfc4122 requires these characters
      uuid[8] = uuid[13] = uuid[18] = uuid[23] = '-';
      uuid[14] = '4';

      // Fill in random data.  At i==19 set the high bits of clock sequence as
      // per rfc4122, sec. 4.1.5
      for (var i = 0; i < 36; i++) {
        if (!uuid[i]) {
          r = 0 | Math.random()*16;
          uuid[i] = chars[(i == 19) ? (r & 0x3) | 0x8 : r];
        }
      }
    }
    return (prefix ? prefix : "") + uuid.join('');
  };


  // Data.Query
  // --------------

  // Query module to be mixed into Data.Graph and Data.Collection data structures
  // No indexing yet, this has been shifted to Data.js 0.7.0

  Data.Query = {

    // Returns all objects matching a particular query object
    query: function(qry) {

      function toArray(v) {
        return _.isArray(v) ? v : [v];
      }

      function match(obj, qry) {
        var matched = true;

        _.find(qry, function(value, property) {
          var val = property === "type" ? obj.types : obj.properties[property];
          var matchedValues = _.intersect(toArray(value), toArray(val));
          if (matchedValues.length === 0) {
            matched = false;
            return true;
          }
        });
        return matched;
      }

      var type = this.get(qry.type);
      var objects = _.select(this.objects, function(o) {
        return match(o, qry);
      });
      return Data.Collection.create(type, objects);
    }
  };

  
  // Data.Type
  // --------------
  
  // A `Data.Type` denotes an IS A relationship about a `Data.Object`. 
  // For example, if you type the object 'Shakespear' with the type 'Person'
  // you are saying that Shakespeare IS A person. Types are also used to hold
  // collections of properties that belong to a certain group of objects.
  

  Data.Type = function(type) {
      this._id = type._id;
      this.type = "/type/type";
      this.name = type.name;
      this.meta = type.meta || {};

      this.indexes = type.indexes || {};

      this.properties = type.properties;
      _.each(this.properties, _.bind(function(property, key) {
        property.type = _.isArray(property.type) ? property.type : [ property.type ];
        property.unique = _.isBoolean(property.unique) ? property.unique : true;
      }, this));
  };

  _.extend(Data.Type.prototype, _.Events, {

    // Serialize a single type node
    toJSON: function() {
      return {
        _id: this._id,
        type: '/type/type',
        properties: this.properties,
        meta: this.meta,
        indexes: _.map(this.indexes, function(i) { return i.properties })
      }
    }
  });
  

  // Data.Object
  // --------------
  
  // Represents a typed data object within a `Data.Graph`.
  // Provides access to properties, defined on the corresponding `Data.Type`.

  Data.Object = function(object, host) {
    this._id = object._id;
    this.host = host;
    this.properties = {};
    this.set(object);
  };

  _.extend(Data.Object.prototype, _.Events, {

    // Returns the most specific type
    type: function() {
      return this.host.get(_.last(this.types));
    },

    // Property lookup according to the type chain
    property: function(property) {
      var p = null;

      _.find(this.types.reverse(), _.bind(function(type) {
        return p = this.host.get(type).properties[property];
      }, this));
      return p;
    },

    
    // There are four different access scenarios for getting a certain property
    // 
    // * Unique value types
    // * Non-unique value types
    // * Unique object types 
    // * Non-Unique object types 
    // 
    // For convenience there's a get method, which always returns the right
    // result depending on the schema information. However, internally, every
    // property of a resource is represented as a non-unique `Data.Hash` 
    // of `Data.Node` objects, even if it's a unique property. So if you want 
    // to be explicit you should use the native methods of `Data.Node`. If
    // two arguments are provided `get` delegates to `Data.Node#get`.
    
    get: function(property, key) {
      var p = this.property(property),
          value = this.properties[property];

      if (!p || !value) return null;

      if (Data.isValueType(p.type)) {
        return value;
      } else {
        return p.unique ? this.host.get(value)
                        : _.map(value, _.bind(function(v) { return this.host.get(v); }, this));   
      }
    },

    // Sets properties on the object
    // Existing properties are overridden / replaced
    set: function(object) {
      var that = this;
      
      if (object.type) this.types = _.isArray(object.type) ? object.type : [object.type];
      if (object.meta) this.meta = this.object.meta;

      _.each(object, _.bind(function(value, key) {
        if (!that.property(key) || key === "type") return;
        that.properties[key] = value;
      }, this));
    },

    // Serialize an `Data.Object`'s properties
    toJSON: function() {
      return _.extend(this.properties, {_id: this._id, type: this.types})
    }
  });
    
  
  // Data.Graph
  // --------------
  
  // A `Data.Graph` can be used for representing arbitrary complex object
  // graphs. Relations between objects are expressed through links that
  // point to referred objects. Data.Graphs can be traversed in various ways.
  // See the testsuite for usage.
  
  Data.Graph = function(graph, options) {
    this.nodes = [];
    this.objects = [];
    this.types = [];
    this.keys = {}; // Lookup objects by key
    if (!graph) return;
    this.merge(graph);
  };

 _.extend(Data.Graph.prototype, Data.Query, _.Events, {
    
    // Merges in another Graph
    merge: function(nodes) {      
      _.each(nodes, _.bind(function(n, key) { this.set(_.extend(n, { _id: key })); }, this));
      return this;
    },

    // API method for accessing objects in the graph space
    get: function(id) {
      return this.nodes[this.keys[id]];
    },

    set: function(node) {
      var types = _.isArray(node.type) ? node.type : [node.type];
      node._id = node._id ? node._id : Data.uuid('/' + _.last(_.last(types).split('/')) + '/');

      function createNode() {
        return _.last(types) === "/type/type" ? new Data.Type(node)
                                              : new Data.Object(node, this);
      }

      var n = this.get(node._id);
      if (!n) {
        n = createNode.apply(this);
        this.keys[node._id] = this.nodes.length;
        this.nodes.push(n);
        
        // Register
        if (_.last(types) === "/type/type") {
          this.types.push(n);
        } else {
          this.objects.push(n);
        }
      } else {
        n.set(node);
      }
      return n;
    },

    // Return all objects matching a query object
    find: function(qry) {
      return this.query(qry);
    },
    
    // Delete node by id, referenced nodes remain untouched
    del: function(id) {
      var node = this.get(id);
      if (!node) return;
      node._deleted = true;
    },

    // Serializes the graph to the JSON-based exchange format
    toJSON: function(extended) {
      var result = {};
      _.each(this.nodes, function(n) {
        result[n._id] = n.toJSON()
      });
      return result;
    }
  });


  // Data.Collection
  // --------------
  
  // A Collection is a simple data abstraction format where a dataset under
  // investigation conforms to a collection of data items that describes all
  // facets of the underlying data in a simple and universal way. You can
  // think of a Collection as a table of data, except it provides precise
  // information about the data contained (meta-data).
  
  Data.Collection = function(spec) {
    this.type = new Data.Type(spec.type, this);
    this.objects = [];
    this.length = 0;
    this.keys = {};

    _.each(spec.objects, _.bind(function(obj) {
      this.add(obj);
    }, this));
  };

  // Creates a Data.Collection using a Data.Type, and an array of Data.Objects
  Data.Collection.create = function(type, objects) {
    var c = new Data.Collection({type: type, objects: []});
    c.objects = objects;
    c.length = objects.length;

    // Register keys for fast lookup
    _.each(objects, function(o, i) {
      c.keys[o._id] = i;
    });
    return c;
  };
  
  _.extend(Data.Collection.prototype, _.Events, Data.Query, {

    // Get an object (item) from the collection
    get: function(id) {
      if (id.match('^/type/')) return this.type;
      return this.objects[this.keys[id]];
    },

    // Return object at a given index
    at: function(index) {
      return this.objects[index];
    },

    // Return index for a given key
    index: function(key) {
      return this.keys[key];
    },

    // Return key for a given index
    key: function(index) {
      return this.objects[index]._id;
    },
    
    // Add a new object to the collection
    add: function(obj) {
      obj._id = obj._id ? obj._id : Data.uuid('/' + _.last(this.type._id.split('/')) + '/');
      obj.type = this.type._id;

      var o = this.get(obj._id);

      if (!o) {
        o = new Data.Object(obj, this);
        this.keys[o._id] = this.objects.length;
        this.objects.push(o);
        this.length = this.objects.length;
      } else {
        o.set(obj);
      }
      return o;
    },
    
    // Find objects that match a particular query
    find: function(qry) {
      qry["type"] = this.type._id;
      return this.query(qry);
    },

    each: function (fn) {
      _.each(this.objects, function(object, i) {
        fn.call(this, object, object._id, i);
      }, this);
      return this;
    },
    
    // Serialize
    toJSON: function() {
      return {
        type: this.type.toJSON(),
        objects: _.map(this.objects, function(n) { return n.toJSON(); })
      };
    }
  });
})();
