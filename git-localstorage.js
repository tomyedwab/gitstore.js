define(["./git-objects"], function(objects) {
    var GitStorage = {
        // Save an object and its descendants to the datastore
        saveObject: function(object) {
            var sha = object.sha();
            if (window.localStorage[sha]) {
                return;
            }
            console.log("Saving", object.type, sha);
            window.localStorage[sha] = object.getFileContents();
            var descendants = object.getDescendants();
            for (var d = 0; d < descendants.length; d++) {
                this.saveObject(descendants[d]);
            }
        },

        // Load an object and its descendants from the datastore
        _loadObject: function(name, sha, shaTable) {
            var fileContents = window.localStorage[sha];
            var ret = fileContents && objects.GitObject.parse(this, name, fileContents, shaTable);
            if (shaTable) {
                shaTable[sha] = ret
            }
            return ret
        },

        // Create a new commit and update the head of the master branch
        commitTree: function(tree, attributes, message) {
            var parentSha = window.localStorage["refs/heads/master"];
            var commit = new objects.GitCommit({
                parentSha: parentSha,
                tree: tree,
                attributes: attributes,
                message: message
                // TODO: Generate shaTable
            });
            this.saveObject(commit);
            window.localStorage["refs/heads/master"] = commit.sha();
            return commit;
        },

        // Load the latest head commit tree & all the associated data
        getHeadTree: function() {
            var sha = window.localStorage["refs/heads/master"];
            var commit = sha && this._loadObject(null, sha);
            return commit && commit.get("tree");
        },

        // Load the latest commit & all the associated data
        getHeadCommit: function() {
            var sha = window.localStorage["refs/heads/master"];
            var commit = sha && this._loadObject(null, sha);
            return commit;
        }
    };
    return {
        GitStorage: GitStorage
    };
});

