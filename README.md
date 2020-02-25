## 概述
Vuex 是一个专为 Vue.js 应用程序开发的状态管理模式(状态管理库)、它采用集中式存储(将vue应用程序中所有组件需要共享的数据抽离到全局，用一个全局对象存放)管理应用的所有组件的状态，并以相应的规则保证状态以一种可预测(控制 state 状态的修改方式)的方式发生变化。

Vuex 的状态存储是响应式的。当 Vue 组件从 store 中读取状态的时候，若 Store 中的状态发生变化，那么相应的组件也会相应地得到高效更新。（new Store 时候得益于 Vue 的响应式机制）

不能(严格模式下不能，非严格模式下可以，但不建议，会破坏状态的追踪)直接改变 store 中的状态。改变 store 中的状态的唯一途径就是显式地提交 (commit) mutation。这样使得我们可以方便地跟踪每一个状态的变化。


## 原理图


![](https://user-gold-cdn.xitu.io/2020/2/24/170773c502755f70?w=701&h=551&f=png&s=22686)

## 源码解析
### 源码目录

![](https://user-gold-cdn.xitu.io/2020/2/24/170774435d766296?w=322&h=780&f=png&s=14819)


上图为 Vuex 源码目录结构，所有的 Vuex 原理代码都放在 `src` 目录下，所以如果只分析原理我们只需要看  `src`目录下的代码，如果需要接合例子，那就先在项目根目录下安装完依赖，然后执行 `npm run dev`命令，启动项目，`监听端口8080` 启动后浏览器页面效果如下：


![](https://user-gold-cdn.xitu.io/2020/2/24/170775122a6762df?w=478&h=282&f=png&s=6877)

建议分析源码的过程中可以接合示例，因为这样可以 `debugger` 断点调试或者 `console.log` 打印查看源码执行或者输出结果，非常利与源码的理解！那下来我们就开启对源码的分析之旅，奥利给！
### 安装插件（Vue.use(Vuex)）
Vuex 在 Vue 应用中是以插件的形式被安装挂载至 Vue 组件实例上的，准确来讲 install Vuex 过程是将 Vuex 的 核心(store)挂载至 Vue 根组件及其后代组件上。那么是如何安装呢？代码如下：
```
<!--Vue 项目中的src/store/index.js-->
<!--index.js-->
import Vue from "vue";
import Vuex from "vuex";

Vue.use(Vuex) //安装插件，use方法内部会调用插件的install方法来安装插件

export default new Vuex.Store({...})

```
这段代码大家一定特别眼熟，vue 项目中只要使用 Vuex ，`Vue.use(Vuex)` 一定就会用到，这就是在 Vue 中安装的方式，很简单，一句代码就无痕安装，爽的飞起。但今天是源码场，so 就不讨论如何在项目中使用 Vuex 了，直接去瞅瞅源码的实现。
> Vuex 的安装一定要在 new Store 之前，否则会报错，原因下面源码分析中会揭晓。

```js
<!--Vue源码-->
<!--use.js-->

/* @flow */

import { toArray } from '../util/index'

export function initUse (Vue: GlobalAPI) {
//重点看这里，这里就是Vue.use(Vuex)时候所调用的use函数，可以看到该函数会接受一个Funcition或Object类型的插件，最终会调用插件内部的install方法安装插件
  Vue.use = function (plugin: Function | Object) {
    const installedPlugins = (this._installedPlugins || (this._installedPlugins = []))
    if (installedPlugins.indexOf(plugin) > -1) {
      return this
    }

    // additional parameters
    const args = toArray(arguments, 1)
    args.unshift(this)
    //类型判断后调用插件install方法
    if (typeof plugin.install === 'function') {
    //终于找到你，最核心之处
      plugin.install.apply(plugin, args)
    } else if (typeof plugin === 'function') {
      plugin.apply(null, args)
    }
    installedPlugins.push(plugin)
    return this
  }
}
```
上面是 Vue 源码的 use.js 文件，我们在外部调用的 use 函数就是这里的这个 use ，该函数接收唯一 参数 plugin，最终会调用 plugin 内部定义的 install 函数执行安装。清楚 use 函数做的事之后，我们前往 Vuex 源码中去寻找 install 方法。

按照经验一般目录下的 index.js 文件都会是项目的入口，那在这里同样我们在 src下瞅瞅有没有 index.js，咦~，还真的有，点进去瞅瞅，一看，嘿嘿嘿~，如果都是地球人，应该都是下面这个样子的吧！
```js
import { Store, install } from './store'
import { mapState, mapMutations, mapGetters, mapActions, createNamespacedHelpers } from './helpers'

export default {
  Store,
  install,
  version: '__VERSION__',
  mapState,
  mapMutations,
  mapGetters,
  mapActions,
  createNamespacedHelpers
}

```

我们在 Vue 项目中 `import Vuex from 'vuex'` 导入的 Vuex 就是 index.js 导出的对象，哇哦，感觉已经开始有点进入状态了。看到了 `install` ，但这里不是老巢，我们去 store.js 中继续瞅瞅。

#### install

```js
<!--store.js-->
import applyMixin from "./mixin";
...



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
```
store.js 就是 Vuex 的最核心地方了，这里就是司令部。install 方法藏得比较深，在文件最底部，因为这里只分析 install 方法，就先将其余无关的代码去掉，避免不必要的干扰。
首先会看到 install 方法接收一个唯一参数 _Vue，这个参数就是 Vue 源码的use方法中传入的那个 Vue，然后一个 if 判断文件头部声明的 Vue 全局变量是否有值以及跟当前传入的 Vue参数引用地址是否相同来避免插件重复安装。
如果是初次安装，则将传入的 _Vue 赋给全局变量 Vue（此做法一是防止重复安装，而是供Store类中使用，还记得文章开头抛出的那个问题吗?这里就找到答案了），然后调用 applyMixin 方法将 vuexInit 混入 混入进 Vue 的 beforeCreate(Vue2.0版本) 或 _init 方法(Vue1.0版本)。
* 总结一下，install 方法做了两件事：
   * 防止 Vuex 被重复安装。
   * 执行 applyMixin 中的 vuexInit 方法，将 Store 挂载至 Vue 应用的根组件和所有子组件实例上（提前剧透）。

#### vuexInit

```js

<!--mixin.js-->

export default function (Vue) {
  const version = Number(Vue.version.split('.')[0])
  
  //如果是 vue2.x 版本,则采用混入beforeCreate钩子函数的方式
  if (version >= 2) {
    Vue.mixin({ beforeCreate: vuexInit })
  } else {
    //如果是 vue1.x版本采用_init方法
    // override init and inject vuex init procedure
    // for 1.x backwards compatibility.
    const _init = Vue.prototype._init
    Vue.prototype._init = function (options = {}) {
      options.init = options.init
        ? [vuexInit].concat(options.init)
        : vuexInit
      _init.call(this, options)
    }
  }

  /**
   * Vuex 初始化钩子，注入到每个实例(vue实例)初始化钩子列表中(就是采用vue中混入钩子函数的方式去挂载Store)
   * Vuex init hook, injected into each instances init hooks list.
   */

  function vuexInit () {
    //获取vue当前组件实例中的options选项
    const options = this.$options
    //注入store
    // store injection
    //options中有store说明是根节点,则直接挂载
    if (options.store) {
      this.$store = typeof options.store === 'function'
        ? options.store()
        : options.store
    //否则挂载父节点中的store至当前组件的$store上
    } else if (options.parent && options.parent.$store) {
      this.$store = options.parent.$store
    }
  }
}

```
这里重点看 vuexInit 方法，vuexInit 最终会将 Vuex 的核心 Store 实例引用给 `this.$store` ，实现全局挂载。这样我们在组件中就可以 `this.$store.xxx` 的方式随心使用全局的 Store 实例了。
* 针对 Vue2.0 版本采用混入（Vue.mixin）的方式混入钩子函数（beforeCreate），在当前 Vue 组件初始化完成前就完美实现 Store 实例的全局挂载，可谓巧夺天工，真 tm 的恰到好处，妙哉！


### 初始化 Store 实例

```js
<!--Vue 项目中的src/store/index.js-->
<!--index.js-->

import Vue from "vue";
import Vuex from "vuex";

Vue.use(Vuex);

//初始化Store实例从这里开始
export default new Vuex.Store({...})

```
现在就应该知道为什么 new Store 实例的时候是 Vuex.Store 了吧。下面我们来瞅瞅 Store 这个类。

#### constuctor
首先从构造函数开始

```js
<!--store.js-->

import applyMixin from "./mixin";
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
    /* 通过vm重设store，新建Vue对象使用Vue内部的响应式实现注册state以及computed */
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
```
这麽大段代码看起来着实有点吓人，不过我已经帮大家把每一步的作用几乎都标上了注释，相信只要有耐心一定看的懂，关键还是要有耐心的。其实构造函数就做了下面这几件事：
* 初始化了一些内部变量（this.xxx）
* 注册根模块和遍历注册所有子模块（ installModule() ）
* 响应化 Store（resetStoreVM()）。实际上是利用vm(vue实例)内部响应式机制对 getters 和 state 响应化处理(getters就是computed)。

下来按道理分析 installModule，但是发现收集 module 的过程也是非常的重要，因此就先说下，走起！

#### ModuleCollection
```js
this._modules = new ModuleCollection(options);
```
看懂了这里，后面才会更容易理解，反正我在阅读源码的过程中是这样滴，哈哈哈，嗝！

```js
<!--src/module/module-collection.js-->
<!--module-collection.js-->

export default class ModuleCollection {
  constructor (rawRootModule) { //rawRootModule: new Vue.Store 时传入的 rootModule
    //注册根模块和递归注册所有子模块
    // register root module
    this.register([], rawRootModule, false)
  }
  
```

这里是模块收集类的构造函数，只要遇到 class 必然是从构造函数开始，会看到构造函数就调用了一个函数 `register`，顾名思义，就是用来注册模块的。

```js
<!--src/module/module-collection.js-->
<!--module-collection.js-->

import Module from './module'
import { assert, forEachValue } from '../util'

    // 注册模块以及递归注册所有子模块
  register (path, rawModule, runtime = true) { //path: []数组,用来存放模块名,rawModule: 传入模块(根模块/子模块)
    if (process.env.NODE_ENV !== 'production') {
      //rawModule 中的 getter mutation action 属性进行格式校验,如果格式有错误则抛出异常
      assertRawModule(path, rawModule)
    }

   //创建一个新的模块实例,会将当前要注册的原始模块对象用属性_rawModule接收,用_children存储子模块,state存储原始state
   // 以及添加一些操作模块的方法
    const newModule = new Module(rawModule, runtime)
    //如果 path.length = 0,这说明是根模块,将 newModule 添加给root属性存储
    if (path.length === 0) {
      this.root = newModule  //此时模块收集器中保存的形式: { root: { _rawModule: rawModule,...}
   
    } else { //否则说明不是根模块,将当前模块使用addChild方法添加到父模块的__children属性里存储
      const parent = this.get(path.slice(0, -1)) //path.slice(0, -1) 返回一个包含原数组第0项到倒数第2项元素的新数组
      //获取到父module之后将当前module存储进父module的__children中
      parent.addChild(path[path.length - 1], newModule)
    }

    // register nested modules 
    //如果当前模块有子模块则递归注册子module ,子module会被装进父module的 _children里: {__children: {[子模块名称]: {_rawModule: rawModule,..}}}
    if (rawModule.modules) {
      //遍历子模块,然后将每一次遍历拿到的子模块rawChildModule,模块名(key)传入回调函数并执行回调函数
      forEachValue(rawModule.modules, (rawChildModule, key) => {
        //调用register方法递归注册子模块,知道模块没有子模块为止
        this.register(path.concat(key), rawChildModule, runtime) //[].concat('app') 返回新数组 ['app']
      })
    }
  }
```
在 register 方法中从根模块开始，首先会通过 `const newModule = new Module(rawModule, runtime)`
创建一个包装模块，判断若是根模块则初始化 root 属性来保存根模块，然后判断当前模块是否还有子模块，如果有则递归调用 this.register 方法将当前子模块信息作为参数传入进行注册。

#### Module
```js
<!--src/module/module.js-->
<!--module.js-->

import { forEachValue } from '../util'

// Base data struct for store's module, package with some attribute and method
export default class Module {
  //构造函数,new Module 实例的时候会自动执行一次(初始化)
  constructor (rawModule, runtime) {
    this.runtime = runtime
    // Store some children item 用来存放当前模块的子模块
    this._children = Object.create(null)
    // Store the origin module object which passed by programmer
    //存放原始模块
    this._rawModule = rawModule
    const rawState = rawModule.state

    // Store the origin module's state
    //存放模块原始state
    this.state = (typeof rawState === 'function' ? rawState() : rawState) || {}
  }

  //是否声明命名空间,返回布尔值
  get namespaced () {
    return !!this._rawModule.namespaced
  }

  //添加子模块
  addChild (key, module) {
    this._children[key] = module
  }

  //移除子模块
  removeChild (key) {
    delete this._children[key]
  }

  //获取子模块
  getChild (key) {
    return this._children[key]
  }

  //更新模块
  update (rawModule) {
    this._rawModule.namespaced = rawModule.namespaced
    if (rawModule.actions) {
      this._rawModule.actions = rawModule.actions
    }
    if (rawModule.mutations) {
      this._rawModule.mutations = rawModule.mutations
    }
    if (rawModule.getters) {
      this._rawModule.getters = rawModule.getters
    }
  }

  //遍历子模块
  forEachChild (fn) {
    forEachValue(this._children, fn)
  }

  //遍历getters
  forEachGetter (fn) {
    if (this._rawModule.getters) {
      forEachValue(this._rawModule.getters, fn)
    }
  }

  //遍历actions
  forEachAction (fn) {
    if (this._rawModule.actions) {
      forEachValue(this._rawModule.actions, fn)
    }
  }
 //遍历mutations
  forEachMutation (fn) {
    if (this._rawModule.mutations) {
      forEachValue(this._rawModule.mutations, fn)
    }
  }
}

```
Moudule 中会初始化一些内部变量和操作模块的内部方法（增删改查被包装的原始模块），_children 存放子模块，_rawModule 存放传入的原始模块，state 存放模块的原始 state，new Moudule 后的新的包装结构是这样的：

```
{
    runtime: false,
    //模块state
    state: {
        count: 0
    },
    //存放子模块
    _children:{}，
    //原始模块完整数据
    _rawModule:{
        actions:{ ... },
        getters:{ ... },
        mutations:{ ... },
        state: { ... }

    },
    namespaced: false,
    //内置方法
    __proto__: {
        addChild(){},
        forEachAction(){}
        ...
    }
    ...
}
```

这样我们在项目中 new Vuex.Store({...})传入的模块数据在这里就被第一次包装成一个新的模块。
下来回到 ModuleCollection 中，会判断如果是根模块则声明一个 root 属性来保存当前这个包装模块（根模块），如果当前模块有子模块，则递归调用 register 注册子模块，注册子模块的过程跟注册根模块相同，然后会将当前子模块使用 addChild 方法添加到父模块的 _children 中。经过模块收集器的 normalize 后我们来看看此时的模块结构：
```js
{   
    //存放根模块
    root: {
            runtime: false,
            //模块state
            state: {
                count: 0
            },
            //存放子模块
            _children:{...}，
            //原始模块完整数据
            _rawModule:{
                actions:{ ... },
                getters:{ ... },
                mutations:{ ... },
                state: { ... }
        
            },
            namespaced: false,
            //内置方法
            __proto__: {
                addChild(){},
                forEachAction(){}
                ...
            }
    },
    //模块收集器内部方法
    __proto__: {
        register() {},
        unregister(){},
        update(){}
        ...
    }
}
```

到这里模块收集器的任务就完成了，会看到会将 new Vuex.Store({})时传入的模块经过模块收集器结构化后模块结构更加清晰，并且增强了模块可操作性（新增了方法）。好，是时候回到 Store 里了。

#### installModule

```js
<!--store.js-->

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
```
installModule 方法首先会给注册的模块加上命名空间（namespace）然后用命名空间作为key，将当前注册模块（根模块/子模块）的 `mutation`、`action`以及 `getter`分别存放（也可以叫注册）进内部变量 `_mutations`，`_action`,`_wrappedGetters`中，同时不要忘记了 state ，使用 Vue.set() 将子模块 state set 进 rootState 中。
* 总结一下到这里完成的事情：
    * 使用 Vue.set() 将子模块 state set 进 rootState 中。
    * 根模块和所有子模块中的 `mutation`,`action`,`getter`分别存放进了`_mutations`，`_action`,`_wrappedGetters`。
> installModule 方法操作的 module 是模块收集器里面的 module
#### resetStoreVM
```js
<!--store.js-->

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
```
resetStoreVM 方法中利用vue内部响应式机制对 getters 和 state 响应化处理( getters 就是 computed ),这样外部组件就是可以 `this.$store.getters.xx/this.$store.state.xx` 使用了，这里就是将 Store 完全响应化的地方。

以上就是初始化一个 Store 实例时构造函数所做的全部工作，初始化工作完成后就是使用了，那下来就瞅瞅在组件中跟操作 store 相关的方法。

#### commit
```js
<!--store.js-->

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
```
该 commit 方法就是我们在组件中调用的那个 commit ， 方法执行过程中首先会在内部变量 _mutations（存放所有 mutation 的地方）中找 出 key 为 type 的选项，然后遍历type对应的 value 数组，调用数组中存放的每一个同名 mutation。然后遍历 _subscribers 发布订阅。

#### dispatch

```js
<!--store.js-->

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

```
这里的 dispatch 也是我们在组件中调用的那个 dispatch，原理跟 commit 方法执行的原理类似，在_actions 中先找到 type ,然后遍历 _actions 中 key 为 type 对应的存放 action 的数组，跟 commit 不同的是 dispatch 函数执行完后可以返回被包装成promise对象的结果。

#### subscribe

```js
<!--store.js-->

  /**
   * 注册订阅函数,暴露订阅函数的注销方法给外部
   */
  subscribe(fn) {
    return genericSubscribe(fn, this._subscribers);
  }
  ...
  
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
```
我们可以通过在外部调用 subscribe 方法将订阅注册进 _subscribers，subscribe 函数执行注册后会暴露出(返回)一个注销订阅的方法给外部，订阅派发的时机是 提交（commit）mutation（commit 方法中，可以回翻瞅一瞅）。

#### registerModule

```js
<!--store.js-->

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

    //调用register函数
    this._modules.register(path, rawModule);
    installModule(
      this,
      this.state,
      path,
      this._modules.get(path),
      options.preserveState
    );
    //重新响应化 Store
    // reset store to update getters...
    resetStoreVM(this, this.state);
  }
```
registerModule 用来在 Store 创建（初始化）完毕后供外部还可以动态注册模块， 内部实现方式跟创建 store 实例时候大致流程一样（先 new module ，再 installModule ，最后 resetStoreVM）

#### unregisterModule
```js
 /**
   * 注销移除动态模块
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
```

既然有注册当然就要有注销，所以 unregisterModule 与 registerModule 相对应，注销动态模块。

#### 严格模式
严格模式模式默认关闭（false），很重要的一个知识点，因为在严格模式下外部修改 state 的唯一方式只能通过提交（commit）mutation 的方式，其他骚操作的修改方式均为报错，这样为状态的可追踪提供了保障。不过因为严格模式对state  采用持续的深度监听，比较耗费性能，生产环境下一定要记得关闭。如果要开启，方式如下：
* 应用中开启方式
```js
export default new Vuex.Store({
//开启严格模式
  strict: true,
  ...
 });
```

* 源码
```js
function resetStoreVM(store, state, hot) {
    ...
// enable strict mode for new vm
  //启动严格模式
  if (store.strict) {
    enableStrictMode(store);
  }
  ...
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
    //深度监听
    { deep: true, sync: true }
  );
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
```

首先会在 `resetStoreVM` 中判断 `store.strict` 是否为 true，如果为 true，调用 `enableStrictMode` 方法利用 `vm`(Vue实例)内部的 `$watch` 对 state 进行持续监听，当发生修改 state 的行为时会触发 `$watch` 中的回调函数然后对 `_committing` 变量的状态进行断言如果为 true 则说明是通过 `_withCommit` 方法改变 state 的 不会断言抛出异常，如果是直接修改 state 则会断言抛出异常，因为此时没有经过 `_withCommit 方法`，`_committing` 状态为 false，说明不是通过 提交（commit）`mutation` 的方法修改 `state` 的。

#### map辅助函数
map辅助函数指的是 mapState、mapMutations、mapGetters、mapActions，使用map辅助函数我们组件中
就可以直接this.xxx，而不用 this.$store.xxx了，原理是：
* mapState 辅助函数,将Store实例中的 state 采用解构方法映射出一个计算属性注入vue的计算属性中
* mapGetters辅助函数,将Store实例中的getter映射注册进vue实例的computed中
* mapMutations 辅助函数,将Store实例中的mutation函数映射注册进vue组件的methods中
* mapActions辅助函数,原理和使用方法等同于mpaMutation,唯一差异是异步分发

源码解析请移步 [map辅助函数](https://github.com/HUYIJUNCODING/Vuex-analysis/blob/master/src/helpers.js)

### 后记
以上就是本文 Vuex 源码解析的全部内容了，从插件的安装到 Store 实例的创建，以及暴露给外部使用的方法，基本上将 Vuex 的所有核心内容都涉及到了。笔者在分析了 Vuex 源码之后仍然要写出来这篇文章的原因是想把自己阅读和分析源码时的主线流程分享出来，这样再结合源码去看可能会更加容易一点。

