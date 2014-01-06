define(["./sha1", "underscore", "backbone"], function(Sha1, _, Backbone) {
    /**
     * Base class for all git objects
     */
    var GitObject = Backbone.Model.extend({
        // Get the actual contents of the object file (unzipped)
        getFileContents: function() {
            var bodyContent = this.getBodyContent();
            return this.type + " " + bodyContent.length + "\0" + bodyContent;
        },

        // Calculate the hash of the node content
        sha: function() {
            var fileContents = this.getFileContents();
            return Sha1.Sha1.hash(fileContents);
        },

        // Get a list of descendant objects for this object
        getDescendants: function() {
            return [];
        }
    });

    // Return a GitObject instance from a flat file
    GitObject.parse = function(storage, name, fileContents) {
        var type = fileContents.split(" ")[0];
        var bodyContent = fileContents.substring(fileContents.indexOf("\0")+1);
        if (type == "blob") {
            return GitBlob.parse(storage, name, bodyContent);
        } else if (type == "tree") {
            return GitTree.parse(storage, name, bodyContent);
        } else if (type == "commit") {
            return GitCommit.parse(storage, name, bodyContent);
        } else {
            // TODO: Raise an error
        }
    };

    /**
     * Blob object type
     */
    var GitBlob = GitObject.extend({
        defaults: {
            name: "",
        },

        // The object type
        type: "blob",

        // Get the text content that will be saved to storage
        getBodyContent: function() {
            var json = this.toJSON();
            delete json["name"];
            json["__type__"] = this.__type__;
            return JSON.stringify(json);
        }
    });

    var blobKindRegistry = {};

    // Register a class by name so it can be serialized/deserialized
    GitBlob.registerKind = function(name, constructor) {
        constructor.prototype.__type__ = name;
        blobKindRegistry[name] = constructor;
    };

    // Register the default kind
    GitBlob.registerKind("GitBlob", GitBlob);

    // Instantiate a blob from the text representation
    GitBlob.parse = function(storage, name, bodyContent) {
        var json = JSON.parse(bodyContent);
        json["name"] = name;

        var type = json["__type__"];
        delete json["__type__"];

        return new blobKindRegistry[type](json);
    };

    /**
     * Tree object type
     */
    var GitTree = GitObject.extend({
        defaults: {
            name: "",
            refs: []
        },

        type: "tree",

        // Get the text content that will be saved to storage
        getBodyContent: function() {
            var bodyRefs = [];
            var refs = this.get("refs");
            _.each(this.get("refs"), function(ref) {
                if (ref instanceof GitBlob) {
                    bodyRefs.push("100644 blob " + ref.sha() + " " + ref.get("name"));
                } else if (ref instanceof GitTree) {
                    bodyRefs.push("040000 tree " + ref.sha() + " " + ref.get("name"));
                } else {
                    // TODO: raise error
                }
            });
            return bodyRefs.join("\n");
        },

        // Get a list of descendant objects for this object
        getDescendants: function() {
            return this.get("refs");
        },

        // Add a blob or tree as a child of this tree object
        addRef: function(ref) {
            var refs = this.get("refs").slice();
            refs.push(ref);
            this.set("refs", refs);
            return this;
        },

        // Create a new blob as a child of this tree object
        createBlob: function(params, constructor) {
            constructor = constructor || GitBlob;
            return this.addRef(new constructor(params));
        },

        // Replace an existing blob with a new child
        replaceBlob: function(name, params, constructor) {
            constructor = constructor || GitBlob;
            var refs = _.map(this.get("refs"), function(ref) {
                if (ref.get("name") == name) {
                    return new constructor(params);
                } else {
                    return ref;
                }
            });
            this.set("refs", refs);
            return this;
        },

        // Create a new tree as a child of this tree object
        createTree: function(params) {
            return this.addRef(new GitTree(params));
        },

        // Ensure a path exists and return the leaf tree
        createPath: function(path) {
            var pathArray = [];
            if (path instanceof Array) {
                pathArray = path;
            } else {
                pathArray = path.split("/");
            }
            var child = _.find(this.get("refs"), function(ref) {
                return ref.get("name") == pathArray[0];
            });
            if (!child) {
                child = new GitTree({name: pathArray[0]});
                this.addRef(child);
            }
            if (pathArray.length > 1) {
                return child.createPath(pathArray.splice(1));
            }
            return child;
        },

        // Find a path, if it exists, and return the leaf tree
        getPath: function(path) {
            var pathArray = [];
            if (path instanceof Array) {
                pathArray = path;
            } else {
                pathArray = path.split("/");
            }
            var child = _.find(this.get("refs"), function(ref) {
                return ref.get("name") == pathArray[0];
            });
            if (!child) {
                return null;
            }
            if (pathArray.length > 1) {
                return child.getPath(pathArray.splice(1));
            }
            return child;
        },

        // Find a child by name
        getChild: function(name) {
            return _.find(this.get("refs"), function(ref) {
                return ref.get("name") == name;
            });
        }
    });

    // Instantiate a blob from the text representation
    GitTree.parse = function(storage, name, bodyContent) {
        var lines = bodyContent.split("\n");
        var refs = [];
        _.each(lines, function(line) {
            var parts = line.split(" ");
            refs.push(storage.loadObject(parts[3], parts[2]));
        });
        return new GitTree({
            name: name,
            refs: refs
        });
    };

    /**
     * Commit object type
     */
    var GitCommit = GitObject.extend({
        defaults: {
            parentSha: null,
            tree: null,
            attributes: {},
            message: ""
        },

        // The object type
        type: "commit",

        // Get the text content that will be saved to storage
        getBodyContent: function() {
            var bodyList = [];
            bodyList.push("tree " + this.get("tree").sha());
            if (this.get("parentSha")) {
                bodyList.push("parent " + this.get("parentSha"));
            }
            for (k in this.get("attributes")) {
                bodyList.push(k + " " + this.get("attributes")[k])
            }

            return bodyList.join("\n") + "\n\n" + this.get("message");
        },

        // Get a list of descendant objects for this object
        getDescendants: function() {
            return [this.get("tree")];
        },

        // Get a copy of the GitTree for modification
        getTree: function() {
            return new GitTree({
                name: this.get("tree").get("name"),
                refs: this.get("tree").get("refs")
            });
        }
    });

    // Instantiate a blob from the text representation
    GitCommit.parse = function(storage, name, bodyContent) {
        var parts1 = bodyContent.split("\n\n");
        var tree = null;
        var parentSha = null;
        var attributes = {};
        var lines = parts1[0].split("\n");
        _.each(lines, function(line) {
            var parts2 = line.split(" ");
            if (parts2[0] == "tree") {
                tree = storage.loadObject("ROOT", parts2[1]);
            } else if (parts2[0] == "parent") {
                parentSha = parts2[1];
            } else {
                attributes[parts2[0]] = parts2[1];
            }
        });
        return new GitCommit({
            parentSha: parentSha,
            tree: tree,
            attributes: attributes,
            message: parts1[1]
        });
    };

    return {
        GitObject: GitObject,
        GitBlob: GitBlob,
        GitTree: GitTree,
        GitCommit: GitCommit
    }
});
