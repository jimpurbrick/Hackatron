// An example Parse.js Backbone application based on the hack app by
// [Jérôme Gravel-Niquet](http://jgn.me/). This demo uses Parse to persist
// the hack items and provide user authentication and sessions.

$(function() {

  Parse.$ = jQuery;

  // Initialize Parse with your Parse application javascript keys
  Parse.initialize("BeOqRSOdPIVf2tJlSnHEJvskytioQqh3EMgwExyo", 
		   "pLI0anpIa6R27URyGSeiRj2TAmaputfaN5AFEZee");

  // Hack Model
  // ----------

  // Our basic Hack model has `content`, `order`, and `done` attributes.
  var Hack = Parse.Object.extend("Hack", {
    // Default attributes for the hack.
    defaults: {
      name: "My Great Hack",
      url: "http://example.com",
    },

    // Ensure that each hack created has `content`.
    initialize: function() {
      if (!this.get("name")) {
        this.set({"name": this.defaults.name});
      }
    },
  });

  // Hack Collection
  // ---------------

  var Hackathon = Parse.Collection.extend({

    // Reference to this collection's model.
    model: Hack,

    /*
    // Filter down the list of all hack items that are finished.
    done: function() {
      return this.filter(function(hack){ return hack.get('done'); });
    },

    // Filter down the list to only hack items that are still not finished.
    remaining: function() {
      return this.without.apply(this, this.done());
    },
    */

    // Hacks are sorted by their original insertion order.
    comparator: function(hack) {
      return hack.get('order');
    }

  });

  // Hack Item View
  // --------------

  // The DOM element for a hack item...
  var HackView = Parse.View.extend({

    //... is a list tag.
    tagName:  "li",

    // Cache the template function for a single item.
    template: _.template($('#item-template').html()),

    // The DOM events specific to an item.
    events: {
      "dblclick label.hack-name" : "edit",
      "dblclick label.hack-url" : "edit",
      "click .hack-destroy"   : "clear",
      "keypress .edit"      : "updateOnEnter",
      "blur .edit"          : "close"
    },

    // The HackView listens for changes to its model, re-rendering. Since there's
    // a one-to-one correspondence between a Hack and a HackView in this
    // app, we set a direct reference on the model for convenience.
    initialize: function() {
      _.bindAll(this, 'render', 'close', 'remove');
      this.model.bind('change', this.render);
      this.model.bind('destroy', this.remove);
    },

    // Re-render the contents of the hack item.
    render: function() {
      $(this.el).html(this.template(this.model.toJSON()));
      this.input = this.$('.edit');
      return this;
    },

    // Switch this view into `"editing"` mode, displaying the input field.
    edit: function() {
      $(this.el).addClass("editing");
      this.input.focus();
    },

    // Close the `"editing"` mode, saving changes to the hack.
    close: function() {
      this.model.save({content: this.input.val()});
      $(this.el).removeClass("editing");
    },

    // If you hit `enter`, we're through editing the item.
    updateOnEnter: function(e) {
      if (e.keyCode == 13) this.close();
    },

    // Remove the item, destroy the model.
    clear: function() {
      this.model.destroy();
    }

  });

  // The Application
  // ---------------

  // The main view that lets a user manage their hack items
  var ManageHacksView = Parse.View.extend({

    // Our template for the line of statistics at the bottom of the app.
    statsTemplate: _.template($('#stats-template').html()),

    // Delegated events for creating new items, and clearing completed ones.
    events: {
      "keypress #new-hack":  "createOnEnter",
      "click #clear-completed": "clearCompleted",
      "click #toggle-all": "toggleAllComplete",
      "click .log-out": "logOut",
      "click ul#filters a": "selectFilter"
    },

    el: ".content",

    // At initialization we bind to the relevant events on the `Hacks`
    // collection, when items are added or changed. Kick things off by
    // loading any preexisting hacks that might be saved to Parse.
    initialize: function() {
      var self = this;

      _.bindAll(this, 'addOne', 'addAll', 'addSome', 'render', 'toggleAllComplete', 'logOut', 'createOnEnter');

      // Main hack management template
      this.$el.html(_.template($("#manage-hacks-template").html()));
      
      this.input = this.$("#new-hack");
      this.allCheckbox = this.$("#toggle-all")[0];

      // Create our collection of Hacks
      this.hacks = new HackList;

      // Setup the query for the collection to look for hacks from the current user
      this.hacks.query = new Parse.Query(Hack);
      this.hacks.query.equalTo("user", Parse.User.current());
        
      this.hacks.bind('add',     this.addOne);
      this.hacks.bind('reset',   this.addAll);
      this.hacks.bind('all',     this.render);

      // Fetch all the hack items for this user
      this.hacks.fetch();

      state.on("change", this.filter, this);
    },

    // Logs out the user and shows the login view
    logOut: function(e) {
      Parse.User.logOut();
      new LogInView();
      this.undelegateEvents();
      delete this;
    },

    // Re-rendering the App just means refreshing the statistics -- the rest
    // of the app doesn't change.
    render: function() {
      var done = this.hacks.done().length;
      var remaining = this.hacks.remaining().length;

      this.$('#hack-stats').html(this.statsTemplate({
        total:      this.hacks.length,
        done:       done,
        remaining:  remaining
      }));

      this.delegateEvents();

      this.allCheckbox.checked = !remaining;
    },

    // Filters the list based on which type of filter is selected
    selectFilter: function(e) {
      var el = $(e.target);
      var filterValue = el.attr("id");
      state.set({filter: filterValue});
      Parse.history.navigate(filterValue);
    },

    filter: function() {
      var filterValue = state.get("filter");
      this.$("ul#filters a").removeClass("selected");
      this.$("ul#filters a#" + filterValue).addClass("selected");
      if (filterValue === "all") {
        this.addAll();
      } else if (filterValue === "completed") {
        this.addSome(function(item) { return item.get('done') });
      } else {
        this.addSome(function(item) { return !item.get('done') });
      }
    },

    // Resets the filters to display all hacks
    resetFilters: function() {
      this.$("ul#filters a").removeClass("selected");
      this.$("ul#filters a#all").addClass("selected");
      this.addAll();
    },

    // Add a single hack item to the list by creating a view for it, and
    // appending its element to the `<ul>`.
    addOne: function(hack) {
      var view = new HackView({model: hack});
      this.$("#hack-list").append(view.render().el);
    },

    // Add all items in the Hacks collection at once.
    addAll: function(collection, filter) {
      this.$("#hack-list").html("");
      this.hacks.each(this.addOne);
    },

    // Only adds some hacks, based on a filtering function that is passed in
    addSome: function(filter) {
      var self = this;
      this.$("#hack-list").html("");
      this.hacks.chain().filter(filter).each(function(item) { self.addOne(item) });
    },

    // If you hit return in the main input field, create new Hack model
    createOnEnter: function(e) {
      var self = this;
      if (e.keyCode != 13) return;

      this.hacks.create({
        content: this.input.val(),
        order:   this.hacks.nextOrder(),
        done:    false,
        user:    Parse.User.current(),
        ACL:     new Parse.ACL(Parse.User.current())
      });

      this.input.val('');
      this.resetFilters();
    },

    // Clear all done hack items, destroying their models.
    clearCompleted: function() {
      _.each(this.hacks.done(), function(hack){ hack.destroy(); });
      return false;
    },

    toggleAllComplete: function () {
      var done = this.allCheckbox.checked;
      this.hacks.each(function (hack) { hack.save({'done': done}); });
    }
  });

  var LogInView = Parse.View.extend({
    events: {
      "submit form.login-form": "logIn",
      "submit form.signup-form": "signUp"
    },

    el: ".content",
    
    initialize: function() {
      _.bindAll(this, "logIn", "signUp");
      this.render();
    },

    logIn: function(e) {
      var self = this;
      var username = this.$("#login-username").val();
      var password = this.$("#login-password").val();
      
      Parse.User.logIn(username, password, {
        success: function(user) {
          new ManageHacksView();
          self.undelegateEvents();
          delete self;
        },

        error: function(user, error) {
          self.$(".login-form .error").html("Invalid username or password. Please try again.").show();
          this.$(".login-form button").removeAttr("disabled");
        }
      });

      this.$(".login-form button").attr("disabled", "disabled");

      return false;
    },

    signUp: function(e) {
      var self = this;
      var username = this.$("#signup-username").val();
      var password = this.$("#signup-password").val();
      
      Parse.User.signUp(username, password, { ACL: new Parse.ACL() }, {
        success: function(user) {
          new ManageHacksView();
          self.undelegateEvents();
          delete self;
        },

        error: function(user, error) {
          self.$(".signup-form .error").html(error.message).show();
          this.$(".signup-form button").removeAttr("disabled");
        }
      });

      this.$(".signup-form button").attr("disabled", "disabled");

      return false;
    },

    render: function() {
      this.$el.html(_.template($("#login-template").html()));
      this.delegateEvents();
    }
  });

  // The main view for the app
  var AppView = Parse.View.extend({
    // Instead of generating a new element, bind to the existing skeleton of
    // the App already present in the HTML.
    el: $("#hackapp"),

    initialize: function() {
      this.render();
    },

    render: function() {
      if (Parse.User.current()) {
        new ManageHacksView();
      } else {
        new LogInView();
      }
    }
  });

  var AppRouter = Parse.Router.extend({
    routes: {
      "all": "all",
      "active": "active",
      "completed": "completed"
    },

    initialize: function(options) {
    },

    all: function() {
      state.set({ filter: "all" });
    },

    active: function() {
      state.set({ filter: "active" });
    },

    completed: function() {
      state.set({ filter: "completed" });
    }
  });

  var state = new AppState;

  new AppRouter;
  new AppView;
  Parse.history.start();
});
