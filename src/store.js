import applyMixin from "./mixin";
import devtoolPlugin from "./plugins/devtool";
import ModuleCollection from "./module/module-collection";
import { forEachValue, isObject, isPromise, assert, partial } from "./util";

//插件安装(install方法执行)的时候绑定vue给当前变量
let Vue; // bind on install

export class Store {
  //构造函数
  constructor(options = {}) { //options用来接收new Vuex.Store({})时候我们传入的选项({state,mutation,...})
    // Auto install if it is not done yet and `window` has `Vue`.
    // To allow users to avoid auto-installation in some cases,
    // this code should be placed here. See #731
    /*
      在浏览器环境下，如果插件还未安装（!Vue即判断是否未安装），则它会自动安装。
      它允许用户在某些情况下避免自动安装。
    */
    if (!Vue && typeof window !== "undefined" && window.Vue) {
      install(window.Vue);
    }
    //安装插件必须在创建Store实例之前,这也就是Vue.use(Vuex)必须在 new Vuex.Store() 上面也原因
    if (process.env.NODE_ENV !== "production") {
      assert(Vue, `must call Vue.use(Vuex) before creating a store instance.`);
      assert(
        typeof Promise !== "undefined",
        `vuex requires a Promise polyfill in this browser.`
      );
      assert(
        this instanceof Store,
        `store must be called with the new operator.`
      );
    }

    /**
     * plugins: 用来存放所有应用在Store上的插件
     * strict: 严格模式,默认为false,如果启用严格模式,则只能允许提交(commit)的方式修改state,否则其他任何修改的方式都会报错
     */
    const { plugins = [], strict = false } = options;
    debugger
    // store internal state
    //定义_committing属性用来判断严格模式下是否是用mutation修改state的(只有在commit方法中会将其状态变为true)
    this._committing = false;
    //存放所有action
    this._actions = Object.create(null);
     //存放actionSubscriber
    this._actionSubscribers = [];
    //存放所有mutation
    this._mutations = Object.create(null);
    //存放所有getter
    this._wrappedGetters = Object.create(null);
    //收集module(利用递归的方式会将根module和后代module收集起来形成一个对象树)
    this._modules = new ModuleCollection(options);
    //根据命名空间存放module
    this._modulesNamespaceMap = Object.create(null);
    //存放订阅者
    this._subscribers = [];
    //用以实现Watch的Vue实例
    this._watcherVM = new Vue();
    //存放getters本地缓存
    this._makeLocalGettersCache = Object.create(null);

    //通过 .call 方式将 commit 方法和 dispatch 方法始终绑定给 Store 实例本身,这样做其调用者永远都是Store,
    //当在异步等改变this指向的环境内,可以保证dispatch和commit 方法中的this不会随着发生改变
    // bind commit and dispatch to self
    const store = this;
    const { dispatch, commit } = this;

    this.dispatch = function boundDispatch(type, payload) {
      return dispatch.call(store, type, payload);
    };
    this.commit = function boundCommit(type, payload, options) {
      return commit.call(store, type, payload, options);
    };

    //严格模式,当strict值为true时意味着开启了严格模式,此时允许修改state的唯一途径只能通过提交(commit)的方式,
    //其他任何修改方式均会抛出异常
    // strict mode
    this.strict = strict;

    //state 保存一份根模块的state
    const state = this._modules.root.state;

    //installModule 方法会注册根模块和递归注册所有子模块,并且将所有模块的getter收集进_wrappedGetters
    // init root module. 初始化根模块
    // this also recursively registers all sub-modules 递归注册所有子模块
    // and collects all module getters inside this._wrappedGetters 收集所有模块的getter进_wrappedGetters
    installModule(this, state, [], this._modules.root);

    // initialize the store vm, which is responsible for the reactivity
    // (also registers _wrappedGetters as computed properties)
    /* 通过vm重设store，新建Vue对象使用Vue内部的响应式机制实现注册state以及getter的响应化 */
    resetStoreVM(this, state);

    // apply plugins 调用插件
    plugins.forEach(plugin => plugin(this));

    //devtool插件
    const useDevtools =
      options.devtools !== undefined ? options.devtools : Vue.config.devtools;
    if (useDevtools) {
      devtoolPlugin(this);
    }
  }
  
  /**
   * 获取state,组件中this.$store.state就触发的是这个方法
   */
  get state() {
    return this._vm._data.$$state;
  }

  /**
   * 防止外部使用this.$store.state = state替换state,这样做会报错
   */
  set state(v) {
    if (process.env.NODE_ENV !== "production") {
      assert(
        false,
        `use store.replaceState() to explicit replace store state.`
      );
    }
  }

  /**
   * commit方法(执行mutation)
   */
  commit(_type, _payload, _options) {
    //校验传入参数
    // check object-style commit
    const { type, payload, options } = unifyObjectStyle(
      _type,
      _payload,
      _options
    );

    const mutation = { type, payload };
    const entry = this._mutations[type];
    //如果提交未定义mutation时会报错提示
    if (!entry) {
      if (process.env.NODE_ENV !== "production") {
        console.error(`[vuex] unknown mutation type: ${type}`);
      }
      return;
    }
    //触发_mutations中类型为type的所有mutation方法
    this._withCommit(() => {
      entry.forEach(function commitIterator(handler) {
        handler(payload);
      });
    });

    //发布订阅(当mutation触发会通知所有订阅者及时更新订阅内容)
    this._subscribers
      .slice() // shallow copy to prevent iterator invalidation if subscriber synchronously calls unsubscribe
      .forEach(sub => sub(mutation, this.state));

    if (process.env.NODE_ENV !== "production" && options && options.silent) {
      console.warn(
        `[vuex] mutation type: ${type}. Silent option has been removed. ` +
          "Use the filter functionality in the vue-devtools"
      );
    }
  }

  /**
   * dispatch方法(执行action)
   */
  dispatch(_type, _payload) {
    //校验参数
    // check object-style dispatch
    const { type, payload } = unifyObjectStyle(_type, _payload);

    const action = { type, payload };
    const entry = this._actions[type];
     //如果提交未定义mutation时会报错提示
    if (!entry) {
      if (process.env.NODE_ENV !== "production") {
        console.error(`[vuex] unknown action type: ${type}`);
      }
      return;
    }

    //发布actionSubscribers订阅
    try {
      this._actionSubscribers
        .slice() // shallow copy to prevent iterator invalidation if subscriber synchronously calls unsubscribe
        .filter(sub => sub.before)
        .forEach(sub => sub.before(action, this.state));
    } catch (e) {
      if (process.env.NODE_ENV !== "production") {
        console.warn(`[vuex] error in before action subscribers: `);
        console.error(e);
      }
    }

    //如果当前type对应的action函数有多个,则遍历数组将每一个action结果组成的结果数组用Promise包装成一个新的Promise，只有一个则直接返回第0个
    const result =
      entry.length > 1
        ? Promise.all(entry.map(handler => handler(payload)))
        : entry[0](payload);
    return result.then(res => {
      try {
        this._actionSubscribers
          .filter(sub => sub.after)
          .forEach(sub => sub.after(action, this.state));
      } catch (e) {
        if (process.env.NODE_ENV !== "production") {
          console.warn(`[vuex] error in after action subscribers: `);
          console.error(e);
        }
      }
      return res;
    });
  }

  /**
   * 注册订阅函数,暴露订阅函数的注销方法给外部
   */
  subscribe(fn) {
    return genericSubscribe(fn, this._subscribers);
  }
 
  /**
   * 注册订阅action函数(不常用)
   */
  subscribeAction(fn) {
    const subs = typeof fn === "function" ? { before: fn } : fn;
    return genericSubscribe(subs, this._actionSubscribers);
  }

  /**
   * 观察一个getter方法
   */
  watch(getter, cb, options) {
    if (process.env.NODE_ENV !== "production") {
      assert(
        typeof getter === "function",
        `store.watch only accepts a function.`
      );
    }
    return this._watcherVM.$watch(
      () => getter(this.state, this.getters),
      cb,
      options
    );
  }

  /**
   * 替换根State
   */
  replaceState(state) {
    this._withCommit(() => {
      this._vm._data.$$state = state;
    });
  }

  /**
   * 注册一个动态模块
   */
  registerModule(path, rawModule, options = {}) {
    //当path为string时强行转换成array
    if (typeof path === "string") path = [path];

    if (process.env.NODE_ENV !== "production") {
      assert(Array.isArray(path), `module path must be a string or an Array.`);
      assert(
        path.length > 0,
        "cannot register the root module by using registerModule."
      );
    }

    //
    this._modules.register(path, rawModule);
    installModule(
      this,
      this.state,
      path,
      this._modules.get(path),
      options.preserveState
    );
    // reset store to update getters...
    resetStoreVM(this, this.state);
  }

  /**
   * 注销移除模块
   */
  unregisterModule(path) {
    if (typeof path === "string") path = [path];

    if (process.env.NODE_ENV !== "production") {
      assert(Array.isArray(path), `module path must be a string or an Array.`);
    }

    //从_modules中移除模块
    this._modules.unregister(path);
    this._withCommit(() => {
      const parentState = getNestedState(this.state, path.slice(0, -1));
      //从State中移除模块state
      Vue.delete(parentState, path[path.length - 1]);
    });
    //重置Store
    resetStore(this);
  }

  /**
   * 热更新模块
   */
  hotUpdate(newOptions) {
    this._modules.update(newOptions);
    resetStore(this, true);
  }

  /**
   * 严格模式修改state
   */
  _withCommit(fn) {
    const committing = this._committing;
    this._committing = true;
    fn();
    this._committing = committing;
  }
}




/**
 * 执行订阅函数的注册,并暴露给外部当前订阅函数的注销方法
 */
function genericSubscribe(fn, subs) { //subs: 存放订阅函数的容器 _subscribers
  if (subs.indexOf(fn) < 0) {
    subs.push(fn);
  }
  return () => {//注销当前订阅函数的方法,暴露给外部调用者
    const i = subs.indexOf(fn);
    if (i > -1) {
      subs.splice(i, 1);
    }
  };
}

/**
 * 重置Store,相当于再一次new Store,但引用不变
 */
function resetStore(store, hot) {
  store._actions = Object.create(null);
  store._mutations = Object.create(null);
  store._wrappedGetters = Object.create(null);
  store._modulesNamespaceMap = Object.create(null);
  const state = store.state;
  // init all modules
  installModule(store, state, [], store._modules.root, true);
  // reset vm
  resetStoreVM(store, state, hot);
}

/**
 * 利用vue内部响应式机制对getters和state响应化处理(getters就是computed),
 * 这样外部组件就是可以this.$store.getters.xx/this.$store.state.xx使用
 */ 
function resetStoreVM(store, state, hot) {
  //存放之前的vm对象
  const oldVm = store._vm;
  // bind store public getters
  store.getters = {};
  // reset local getters cache
  store._makeLocalGettersCache = Object.create(null);
  const wrappedGetters = store._wrappedGetters;
  const computed = {};
  //store中的getters computed化
  forEachValue(wrappedGetters, (fn, key) => {
    // use computed to leverage its lazy-caching mechanism
    // direct inline function use will lead to closure preserving oldVm.
    // using partial to return function with only arguments preserved in closure environment.
    computed[key] = partial(fn, store);
    //通过Object.defineProperty为每一个getter设置get方法，此时,getter使用的时候就相当于vue中的computed
    //比如获取this.$store.getters.test的时候获取的是store._vm.test，
    //简单的讲就是将store中的getters computed化
    Object.defineProperty(store.getters, key, {
      get: () => store._vm[key],
      enumerable: true // for local getters
    });
  });

  // use a Vue instance to store the state tree
  // suppress warnings just in case the user has added
  // some funky global mixins
  const silent = Vue.config.silent;
    //new Vue的时候不会报警告
  Vue.config.silent = true;
  //通过创建新的vue实例然后利用vue内部响应式机制对state和getters进行响应化,getters就相当于computed,并将该vue实例挂载到Store._vm属性上
  store._vm = new Vue({
    data: {
      $$state: state
    },
    computed
  });

  Vue.config.silent = silent;
  // enable strict mode for new vm
  //启动严格模式
  if (store.strict) {
    enableStrictMode(store);
  }

  //如果旧的_vm实例存在, 则解除旧vm的state的引用，以及销毁旧的Vue对象(有新的_vm,就不需要旧的了,始终保持只有同一个vue实例对象)
  if (oldVm) {
    if (hot) {
      // dispatch changes in all subscribed watchers
      // to force getter re-evaluation for hot reloading.
      store._withCommit(() => {
        oldVm._data.$$state = null;
      });
    }
    Vue.nextTick(() => oldVm.$destroy());
  }
}

/**
 * 做三件事:1.注册根模块,2.遍历注册所有子模块,3.所有模块的getter收集进_wrappedGetters
 */ 
function installModule(store, rootState, path, module, hot) {
  const isRoot = !path.length; //判断是否是根模块
  //获取当前path对应模块的命名空间,如果是根模块则默认返回 '',如果有子模块且子模块声明namespaced=true则返回模块名 + '/'的格式,
  //例如 根模块下有app子模块,app下又有user子模块,且都声明了namespaced=true则命名空间就为app/user/
  const namespace = store._modules.getNamespace(path); 

  // register in namespace map  据namespace存放module 格式: { namespace: module}
  if (module.namespaced) {
    //如果命名空间重复则抛异常提示(命名空间不能重复)
    if (
      store._modulesNamespaceMap[namespace] &&
      process.env.NODE_ENV !== "production"
    ) {
      console.error(
        `[vuex] duplicate namespace ${namespace} for the namespaced module ${path.join(
          "/"
        )}`
      );
    }
    //执行存储: {namespace: module }
    store._modulesNamespaceMap[namespace] = module;
  }

  //子module设置state
  // set state
  if (!isRoot && !hot) {
    //拿到父模块的State
    const parentState = getNestedState(rootState, path.slice(0, -1));
    //拿到当前模块的命名空间(模块名)
    const moduleName = path[path.length - 1];
  
    store._withCommit(() => {
      if (process.env.NODE_ENV !== "production") {
        //当前模块名称如果和父模块state中的属性重名,会报警告
        if (moduleName in parentState) {
          console.warn(
            `[vuex] state field "${moduleName}" was overridden by a module with the same name at "${path.join(
              "."
            )}"`
          );
        }
      }
      //将当前模块(也是子模块)State设置为响应式
      Vue.set(parentState, moduleName, module.state);
    });
  }

  //context 上下文对象,每一个模块中都有一个context(里面包含 state,getters,commit,dispatch,等方法和当前模块的信息)
  const local = (module.context = makeLocalContext(store, namespace, path));

  //注册mutation
  module.forEachMutation((mutation, key) => {
    const namespacedType = namespace + key; //例如: app/counter/increment
    //会将当前模块下所有的mutation注册进 _mutation,格式形如:{namespacedType:[function wrappedMutationHandler(payload) {}]}
    registerMutation(store, namespacedType, mutation, local);
  });

  //注册action
  module.forEachAction((action, key) => {
    //这里的root说明下,如果声明root属性为true,则性质为全局命名空间下的action而不是当前子模块局部作用域下的action
    //往往在子模块中声明为全局action时使用
    const type = action.root ? key : namespace + key;
    const handler = action.handler || action;
    registerAction(store, type, handler, local);
  });

  //注册getter
  module.forEachGetter((getter, key) => {
    const namespacedType = namespace + key;
    registerGetter(store, namespacedType, getter, local);
  });

  //遍历子模块,然后递归注册子模块
  module.forEachChild((child, key) => {
    installModule(store, rootState, path.concat(key), child, hot);
  });
}

/**
 * make localized dispatch, commit, getters and state
 * if there is no namespace, just use root ones
 */
function makeLocalContext(store, namespace, path) {
  const noNamespace = namespace === "";

  const local = {
    dispatch: noNamespace
      ? store.dispatch
      : (_type, _payload, _options) => {
          const args = unifyObjectStyle(_type, _payload, _options);
          const { payload, options } = args;
          let { type } = args;

          if (!options || !options.root) {
            type = namespace + type;
            if (
              process.env.NODE_ENV !== "production" &&
              !store._actions[type]
            ) {
              console.error(
                `[vuex] unknown local action type: ${args.type}, global type: ${type}`
              );
              return;
            }
          }

          return store.dispatch(type, payload);
        },

    commit: noNamespace
      ? store.commit
      : (_type, _payload, _options) => {
          const args = unifyObjectStyle(_type, _payload, _options);
          const { payload, options } = args;
          let { type } = args;

          if (!options || !options.root) {
            type = namespace + type;
            if (
              process.env.NODE_ENV !== "production" &&
              !store._mutations[type]
            ) {
              console.error(
                `[vuex] unknown local mutation type: ${args.type}, global type: ${type}`
              );
              return;
            }
          }

          store.commit(type, payload, options);
        }
  };

  // getters and state object must be gotten lazily
  // because they will be changed by vm update
  Object.defineProperties(local, {
    getters: {
      get: noNamespace
        ? () => store.getters
        : () => makeLocalGetters(store, namespace)
    },
    state: {
      get: () => getNestedState(store.state, path)
    }
  });

  return local;
}

function makeLocalGetters(store, namespace) {
  if (!store._makeLocalGettersCache[namespace]) {
    const gettersProxy = {};
    const splitPos = namespace.length;
    Object.keys(store.getters).forEach(type => {
      // skip if the target getter is not match this namespace
      if (type.slice(0, splitPos) !== namespace) return;

      // extract local getter type
      const localType = type.slice(splitPos);

      // Add a port to the getters proxy.
      // Define as getter property because
      // we do not want to evaluate the getters in this time.
      Object.defineProperty(gettersProxy, localType, {
        get: () => store.getters[type],
        enumerable: true
      });
    });
    store._makeLocalGettersCache[namespace] = gettersProxy;
  }

  return store._makeLocalGettersCache[namespace];
}

//注册mutation. Store中所有模块的mutation都会注册进_mutations对象中,以 namespace + type 作为 key, 
//[function wrappedMutationHandler(payload) {},...]作为value,注意,这里是一个数组,这也就是不同模块中可以
//定义同名mutation的原因,当在commit时候,会遍历整个数组,然后触发该type对应这个数组里面的所有mutation函数
function registerMutation(store, type, handler, local) {
  const entry = store._mutations[type] || (store._mutations[type] = []);
  entry.push(function wrappedMutationHandler(payload) {
    //这里的 local.state 就是context对象中的state,context中的state又引用的是Store实例中State下对应命名空间的State,简单的讲
    //这里的local.state就是Store实例中根State对象下对应命名空间的子state引用
    handler.call(store, local.state, payload); 
  });
}


//注册action
function registerAction(store, type, handler, local) {
  const entry = store._actions[type] || (store._actions[type] = []);
  entry.push(function wrappedActionHandler(payload) {
    let res = handler.call(
      store,
      {
        //当前模块中的属性
        dispatch: local.dispatch,
        commit: local.commit,
        getters: local.getters,
        state: local.state,
        //根模块中的属性
        rootGetters: store.getters,
        rootState: store.state
      },
      payload
    );
    //如果返回的res不是一个promise对象则包装成Promise 对象
    if (!isPromise(res)) {
      res = Promise.resolve(res);
    }
    if (store._devtoolHook) {
      return res.catch(err => {
        store._devtoolHook.emit("vuex:error", err);
        throw err;
      });
      //否则直接返回res
    } else {
      return res;
    }
  });
}

//注册getter
function registerGetter(store, type, rawGetter, local) {
  //getter名称不能重复,这点需要注意,跟mutation,action不同
  if (store._wrappedGetters[type]) {
    if (process.env.NODE_ENV !== "production") {
      console.error(`[vuex] duplicate getter key: ${type}`);
    }
    return;
  }
  store._wrappedGetters[type] = function wrappedGetter(store) {
    return rawGetter(
      local.state, // local state
      local.getters, // local getters
      store.state, // root state
      store.getters // root getters
    );
  };
}

//该函数是用来启动严格模式的
//如果当前store启动严格模式,则在store实例初始化时调用该函数,函数中采用vue的watch机制对state进行深度监听,
//如果发现修改state的方式非提交commit方式,则抛出异常,不允许(严格模式下commit是唯一修改state的方式)
function enableStrictMode(store) {
  store._vm.$watch(
    function() {
      return this._data.$$state;
    },
    () => {
      if (process.env.NODE_ENV !== "production") {
        assert(
          store._committing,
          `do not mutate vuex store state outside mutation handlers.`
        );
      }
    },
    { deep: true, sync: true }
  );
}

//获取根模块中的State
function getNestedState(state, path) {
  return path.reduce((state, key) => state[key], state);
}

/**
 * 校验参数
 */
function unifyObjectStyle(type, payload, options) {
  if (isObject(type) && type.type) {
    options = payload;
    payload = type;
    type = type.type;
  }

  if (process.env.NODE_ENV !== "production") {
    assert(
      typeof type === "string",
      `expects string as the type, but found ${typeof type}.`
    );
  }

  return { type, payload, options };
}

//提供给外部(Vue)安装Vuex插件的方法, 执行 Vue.use(Vuex)时候,内部会通过调用 install 方法完成 Store 的注入,即将 Store 挂载到 Vue 原型上
export function install(_Vue) {
  //判断插件是否已经被安装过,如果已经安装过,则不能再次被安装
  if (Vue && _Vue === Vue) {
    if (process.env.NODE_ENV !== "production") {
      console.error(
        "[vuex] already installed. Vue.use(Vuex) should be called only once."
      );
    }
    return;
  }
  //用声明的全局变量保存传入的 Vue,这样做一是:防止插件被重复安装,二是:供上面的Store类实例化过程内部使用
  Vue = _Vue;
  //将 vuexInit(挂载Store到vue原型上的方法) 混入进 Vue 的 beforeCreate(Vue2.0版本) 或 _init 方法(Vue1.0版本)
  applyMixin(Vue);
}
