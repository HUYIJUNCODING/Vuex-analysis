import Module from './module'
import { assert, forEachValue } from '../util'

export default class ModuleCollection {
  constructor (rawRootModule) { //rawRootModule: new Vue.Store 时传入的 rootModule
    //注册根模块和递归注册所有子模块
    // register root module
    this.register([], rawRootModule, false)
  }
  
  //这个方法有点意思,如果reduce有第二个参数(这里是this.root)先会执行一次回调函数将this.root传递给module,然后遍历path,回调函数中的参数
  //module: 上次回调的结果,key:遍历path的当前项,然后每次会将上次回调函数执行结果传给下次回调的第一个参数module,直到path最后一项,
  //方法结束返回最终结果给外部调用者
  get (path) {
    return path.reduce((module, key) => {
      return module.getChild(key)
    }, this.root) 
  }

  //获取模块命名空间,如果模块中定义了namespaced 属性,并且为true,则命名空间要 '/' 例如: 根模块下的子模块app 并且声明了namespaced:true ,
  //则app模块的命名空间为 app/ ,依次类推
  getNamespace (path) {
    let module = this.root //始终是根模块
    return path.reduce((namespace, key) => {
      module = module.getChild(key)
      return namespace + (module.namespaced ? key + '/' : '')
    }, '')
  }

  //更新模块
  update (rawRootModule) {
    update([], this.root, rawRootModule)
  }
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

  //注销(移除)path路径对应的模块
  unregister (path) {
    const parent = this.get(path.slice(0, -1))
    const key = path[path.length - 1]
    if (!parent.getChild(key).runtime) return

    parent.removeChild(key)
  }
}

//更新targetModule 模块为 newModule
function update (path, targetModule, newModule) {
  if (process.env.NODE_ENV !== 'production') {
    assertRawModule(path, newModule)
  }

  // update target module
  targetModule.update(newModule)

  // update nested modules
  if (newModule.modules) {
    for (const key in newModule.modules) {
      if (!targetModule.getChild(key)) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(
            `[vuex] trying to add a new module '${key}' on hot reloading, ` +
            'manual reload is needed'
          )
        }
        return
      }
      update(
        path.concat(key),
        targetModule.getChild(key),
        newModule.modules[key]
      )
    }
  }
}


/**
 * 从这里往下部分都是校验当前模块getter,mutation,action格式相关的代码
 */

const functionAssert = {
  assert: value => typeof value === 'function',
  expected: 'function'
}

const objectAssert = {
  assert: value => typeof value === 'function' ||
    (typeof value === 'object' && typeof value.handler === 'function'),
  expected: 'function or object with "handler" function'
}

const assertTypes = {
  getters: functionAssert,
  mutations: functionAssert,
  actions: objectAssert
}
//校验 module中的 getter(function),mutation(function),action(function 或者含有handler的obj)格式,如果格式不符合预期则报错提示
function assertRawModule (path, rawModule) {
  Object.keys(assertTypes).forEach(key => {
    if (!rawModule[key]) return //当前模块如果没有rawModule[key]选项则return 结束本次循环

    const assertOptions = assertTypes[key]

    forEachValue(rawModule[key], (value, type) => {
      //断言
      assert(
        assertOptions.assert(value), 
        //输出断言的错误信息
        makeAssertionMessage(path, key, type, value, assertOptions.expected)
      )
    })
  })
}

//该函数会输出断言的错误信息
function makeAssertionMessage (path, key, type, value, expected) {
  let buf = `${key} should be ${expected} but "${key}.${type}"`
  if (path.length > 0) {
    buf += ` in module "${path.join('.')}"`
  }
  buf += ` is ${JSON.stringify(value)}.`
  return buf
}
