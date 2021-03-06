module("Model");

test("defining attributes when instantiating a model", function() {
  var attributes = { a: "a", b: "b" }
  var model = new Model.Model(attributes)

  deepEqual(attributes, model.attributes, "attributes are set")

  attributes.a = "b"

  equal(model.attributes.a, "a", "attributes are copied")

  deepEqual({}, new Model.Model(undefined).attributes, "attributes is an empty object")
})

test("get, set, attributes, changes, reset, save, destroy", function() {
  var Post = Model("post");
  var post = new Post({ title: "Foo", body: "..." });

  deepEqual(post.attributes, { title: "Foo", body: "..." });
  deepEqual(post.changes, {});

  var attr = post.get()
  deepEqual(attr, { title: "Foo", body: "..." });
  attr.title = "Bar";
  equal(post.attributes.title, "Foo", "`attr` should return a copy of attributes not the real thing");

  post.set("title", null)
  equal(post.attributes.title, "Foo", "attributes should be unchanged");
  equal(post.changes.title, null);
  equal(post.get("title"), null, "null value should be read back as null")

  post.set("title", "Foo")
  equal(post.attributes.title, "Foo");
  ok(!("title" in post.changes), "unchanged value shouldn't appear in changes");
  equal(post.get("title"), "Foo")

  post.reset();
  deepEqual(post.attributes, { title: "Foo", body: "..." });
  deepEqual(post.changes, {});
  deepEqual(post.get(), { title: "Foo", body: "..." })

  // Set attribute using attr.
  ok(post.set("title", "Bar") === post, "returns self")

  // Check attributes and changes.
  equal(post.get("title"), "Bar")
  deepEqual(post.attributes, { title: "Foo", body: "..." }, "attributes should be unchanged");
  deepEqual(post.changes, { title: "Bar" });
  deepEqual(post.get(), { title: "Bar", body: "..." })

  ok(post.reset() === post, "returns self");

  equal(post.get("title"), "Foo")
  deepEqual(post.changes, {});

  // Set again
  post.set("title", "Bar")

  deepEqual(post.attributes, { title: "Foo", body: "..." });
  deepEqual(post.changes, { title: "Bar" });

  ok(post.save() === post);

  deepEqual(post.attributes, { title: "Bar", body: "..." });
  deepEqual(post.changes, {});

  ok(post.set({ title: "Foo", bar: "Bar" }) === post, "returns self")

  deepEqual(post.attributes, { title: "Bar", body: "..." });
  deepEqual(post.changes, { title: "Foo", bar: "Bar" });

  ok(post.save(function(success) {
    ok(success);
  }) === post);

  deepEqual(post.attributes, { bar: "Bar", body: "...", title: "Foo" });
  deepEqual(post.changes, {});

  post.destroy(function(success) {
    ok(success);
  });
});

test("custom methods", function() {
  var Post = Model("post", function(klass, proto) {
    this.foo = function() { return "foo" }
    klass.bar = function() { return "bar" }
    proto.foo = function() { return "foo" }
    this.prototype.bar = function() { return "bar" }
  })

  equal(Post.foo(), "foo");
  equal(Post.bar(), "bar");

  var post = new Post();

  equal(post.foo(), "foo");
  equal(post.bar(), "bar");
});

test("valid, validate, errors", function() {
  var Post = Model("post", function() {
    this.prototype.validate = function() {
      if (!/\S/.test(this.get("body") || ""))
        this.errors.add("body", "can't be blank");

      if (this.get("title") == "Foo")
        this.errors.add("title", "should not be Foo");
      if (this.get("title") != "Bar")
        this.errors.add("title", "should be Bar");
    }
  });

  var post = new Post();

  ok(!post.valid());
  equal(post.errors.size(), 2);
  deepEqual(post.errors.on("body"), ["can't be blank"]);
  deepEqual(post.errors.on("title"), ["should be Bar"]);

  post.save(function(success) {
    ok(!success);
  });

  post.set("title", "Foo")

  ok(!post.valid());
  equal(post.errors.size(), 3);
  deepEqual(post.errors.on("body"), ["can't be blank"]);
  deepEqual(post.errors.on("title"), ["should not be Foo", "should be Bar"]);

  post.reset();

  equal(post.errors.size(), 0);
  deepEqual(post.errors.on("body"), []);
  deepEqual(post.errors.on("title"), []);

  post.set({
    body: "...",
    title: "Bar"
  });

  ok(post.valid());
  equal(post.errors.size(), 0);
  deepEqual(post.errors.on("body"), []);
  deepEqual(post.errors.on("title"), []);

  post.save(function(success) {
    ok(success);
  });

  deepEqual(post.changes, {});
});

test('model collection "class" methods', function() {
  var Post = Model("post");

  ok(Post.collection.first() === undefined, "collection starts empty");

  var post = new Post();
  ok(Post.collection.first() === undefined, "collection is unaffected");

  post.save();
  ok(Post.collection.first() === post, "post added to collection automatically");

  post.destroy();
  ok(Post.collection.first() === undefined, "post removed from collection automatically");
});

test("persistence failure", function() {
  var TestPersistence = {
    destroy: function(model, callback) {
      callback(false);
    },

    save: function(model, callback) {
      callback(false);
    }
  };

  var Post = Model("post", function() {
    this.persistence = TestPersistence
  });

  var events = [];

  // Stub trigger and capture its argument.
  Post.prototype.trigger = function(name) {
    events.push(name);
  };

  var post = new Post();
  post.save();

  deepEqual(events, [], "should not trigger create event if persistence failed");
  deepEqual(Post.collection.length, 0, "post should not be added to collection");

  post.attributes.id = 1;
  post.save();

  deepEqual(events, [], "should not trigger update event if persistence failed");

  post.destroy();

  deepEqual(events, [], "should not trigger destroy event if persistence failed");
});

test("#initialize", function() {
  var Post = Model("post", function() {
    this.prototype.initialize = function() {
      this.initialized = true
    }
  })

  var post = new Post()

  ok(post.initialized)
})

test("saving a model with an id should add it to the collection if it isn't already present", function() {
  var Post = Model("post")
  var post = new Post({ id: 1 }).save()

  ok(Post.collection.first() === post)
})

test("anyInstance events", 14, function() {
  var Post = Model("post")

  var results = []

  Post.anyInstance.on("initialize", function(post) { results.push("initialize", post) })
  Post.anyInstance.on("save", function(post) { results.push("save", post) })
  Post.anyInstance.on("destroy", function(post) { results.push("destroy", post) })

  var post1 = new Post()
  var post2 = new Post()
  var post3 = new Post()

  post1.save()
  post3.save()
  post1.destroy()
  post2.save()

  var expected = [
    "initialize", post1,
    "initialize", post2,
    "initialize", post3,
    "save", post1,
    "save", post3,
    "destroy", post1,
    "save", post2
  ]

  for (var i = 0; i < expected.length; i++) {
    ok(results[i] === expected[i])
  }
})

test("change event", function() {
  var Post = Model.Model.extend()
  var post = new Post({ foo: "bar", abc: 123, xyz: 789 })

  var events = []

  post.on("change", function(p) {
    ok(p === post)
    events.push("change")
  })

  post.on("change:foo", function(p) {
    ok(p === post)
    events.push("change:foo")
  })

  post.on("change:xyz", function(p) {
    ok(p === post)
    events.push("change:xyz")
  })

  post.on("change:abc", function() {
    ok(false)
  })

  post.set("foo", "baz")
  post.set({ foo: "bob", xyz: 123 })

  same(events, ["change:foo", "change", "change:foo", "change:xyz", "change"])
})
