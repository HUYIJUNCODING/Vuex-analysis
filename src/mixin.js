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
