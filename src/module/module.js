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
