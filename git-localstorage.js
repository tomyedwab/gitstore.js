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
        loadObject: function(name, sha) {
            var fileContents = window.localStorage[sha];
            console.log("Loaded", sha, fileContents);
            return fileContents && objects.GitObject.parse(this, name, fileContents);
        },

        // Create a new commit and update the head of the master branch
        commitTree: function(tree, attributes, message) {
            var parentSha = window.localStorage["refs/heads/master"];
            var commit = new objects.GitCommit({
                parentSha: parentSha,
                tree: tree,
                attributes: attributes,
                message: message
            });
            this.saveObject(commit);
            window.localStorage["refs/heads/master"] = commit.sha();
            return commit;
        },

        // Load the latest head commit tree & all the associated data
        getHeadTree: function() {
            var sha = window.localStorage["refs/heads/master"];
            var commit = sha && this.loadObject(null, sha);
            return commit && commit.get("tree");
        }
    };
    return {
        GitStorage: GitStorage
    };
});

