/**
 * 前端性能优化：内联对象/函数提取
 * 
 * 问题：内联对象/函数在每次渲染时都会创建新引用，
 * 导致子组件不必要的重渲染（即使子组件是 memo 的）
 * 
 * 解决方案：
 * 1. 将静态对象/函数提取到组件外部
 * 2. 使用 useMemo 缓存动态对象
 * 3. 使用 useCallback 缓存回调函数
 */

// ❌ 错误示例：内联对象导致重渲染
function BadExample({ data }) {
  return (
    <ChildComponent
      config={{ theme: 'dark', size: 'lg' }}  // 每次渲染创建新对象
      onClick={() => console.log(data)}        // 每次渲染创建新函数
    />
  )
}

// ✅ 正确示例：提取静态对象
const STATIC_CONFIG = { theme: 'dark', size: 'lg' }

function GoodExample({ data }) {
  const handleClick = useCallback(() => {
    console.log(data)
  }, [data])
  
  return (
    <ChildComponent
      config={STATIC_CONFIG}
      onClick={handleClick}
    />
  )
}

// ✅ 正确示例：useMemo 缓存动态对象
function DynamicExample({ theme, size }) {
  const config = useMemo(() => ({
    theme,
    size,
  }), [theme, size])
  
  return <ChildComponent config={config} />
}

// ── 常见场景 ──

// 1. 样式对象
// ❌ <div style={{ padding: 16, margin: 8 }}>
// ✅ const CONTAINER_STYLE = { padding: 16, margin: 8 }
// ✅ <div style={CONTAINER_STYLE}>

// 2. Select 选项
// ❌ <Select options={[{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]} />
// ✅ const OPTIONS = [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]
// ✅ <Select options={OPTIONS} />

// 3. 表格列定义
// ❌ const columns = [{ key: 'id', ... }, { key: 'name', ... }]  // 组件内部
// ✅ const COLUMNS = [{ key: 'id', ... }, { key: 'name', ... }]  // 组件外部

// 4. 事件处理
// ❌ <button onClick={() => setCount(c => c + 1)}>
// ✅ const increment = useCallback(() => setCount(c => c + 1), [])
// ✅ <button onClick={increment}>

export { STATIC_CONFIG }
