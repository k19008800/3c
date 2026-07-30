
> **閫傜敤瀵硅薄**锛氬墠绔紑鍙戝伐绋嬪笀
> **鐘舵€?*锛歅1 鏂板瑙勮寖

### 15.1 鍏叡缁勪欢娓呭崟

#### 鍩虹缁勪欢

| 缁勪欢 | 鐢ㄩ€?| 鐘舵€?|
|------|------|------|
| PageHeader | 椤甸潰鏍囬鏍忥紝鍚潰鍖呭睉+鎿嶄綔鎸夐挳 | 宸叉湁 |
| SearchBar | 鎼滅储妗嗭紝鏀寔鍏抽敭璇?鏃堕棿鑼冨洿/鐘舵€佺瓫閫?| 宸叉湁 |
| DataTable | 閫氱敤鏁版嵁琛ㄦ牸锛屾敮鎸佹帓搴?绛涢€?鍒嗛〉 | 宸叉湁 |
| FilterPanel | 楂樼骇绛涢€夐潰鏉匡紝鏀寔澶氭潯浠剁粍鍚?| 宸叉湁 |
| StatusBadge | 鐘舵€佹爣绛撅紝棰滆壊/鍥炬爣鏍规嵁鐘舵€佽嚜鍔ㄦ槧灏?| 宸叉湁 |
| ConfirmDialog | 纭寮圭獥锛屾敮鎸佽嚜瀹氫箟鍐呭鍜岀‘璁ゆ寜閽枃瀛?| 宸叉湁 |
| EmptyState | 绌虹姸鎬佸崰浣嶅浘+寮曞鏂囧瓧+鎿嶄綔鎸夐挳 | 宸叉湁 |
| LoadingSkeleton | 楠ㄦ灦灞忓姞杞藉崰浣?| 宸叉湁 |
| PageError | 椤甸潰绾ч敊璇彁绀?閲嶈瘯鎸夐挳 | 宸叉湁 |
| ExportButton | 瀵煎嚭鎸夐挳锛屾敮鎸?CSV/JSON/PDF 鏍煎紡閫夋嫨 | 宸叉湁 |

#### 涓氬姟缁勪欢

| 缁勪欢 | 鐢ㄩ€?| 鐘舵€?|
|------|------|------|
| BalanceDisplay | 浣欓灞曠ず锛屽惈璐у竵绗﹀彿+鏍煎紡鍖?| 宸叉湁 |
| TokenDisplay | Token 鏁伴噺灞曠ず锛屽惈鍗曚綅鎹㈢畻 | 宸叉湁 |
| ModelSelector | 妯″瀷閫夋嫨鍣紝鏀寔鍒嗙被/鎼滅储/瀵规瘮 | 宸叉湁 |
| TimeRangePicker | 鏃堕棿鑼冨洿閫夋嫨鍣紝鏀寔棰勮锛堜粖鏃?鏈懆/鏈湀锛?| 宸叉湁 |
| CopyButton | 涓€閿鍒讹紝鍚鍒舵垚鍔熸彁绀?| 宸叉湁 |
| RichTextEditor | 瀵屾枃鏈紪杈戝櫒锛屾敮鎸?HTML/Markdown | 宸叉湁 |
| FileUploader | 鏂囦欢涓婁紶锛屾敮鎸佹嫋鎷?澶氭枃浠?杩涘害 | 宸叉湁 |
| TrendChart | 瓒嬪娍鍥撅紝鍩轰簬 Recharts 灏佽锛屾敮鎸佹煴鐘?鎶樼嚎 | 宸叉湁 |
| PieChart | 楗煎浘锛屾敮鎸佸浘渚?鐧惧垎姣?| 宸叉湁 |
| KpiCard | KPI 鎸囨爣鍗＄墖锛屽惈瓒嬪娍绠ご+鐜瘮 | 宸叉湁 |

### 15.2 缁勪欢 Props 瑙勮寖

```typescript
// 閫氱敤 Props 瑙勮寖
interface CommonProps {
  className?: string;
  style?: React.CSSProperties;
  loading?: boolean;
  disabled?: boolean;
}

// DataTable Props
interface DataTableProps<T> extends CommonProps {
  columns: Column<T>[];
  data: T[];
  pagination?: PaginationProps;
  onSort?: (field: string, order: 'asc' | 'desc') => void;
  onRowClick?: (row: T) => void;
  selectedRows?: T[];
  onSelectionChange?: (rows: T[]) => void;
  emptyText?: string;
  loading?: boolean;
}

// ConfirmDialog Props
interface ConfirmDialogProps extends CommonProps {
  open: boolean;
  title: string;
  content: string | React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  confirmVariant?: 'primary' | 'danger' | 'warning';
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}
```

### 15.3 UI 椋庢牸鎸囧崡

| 瑙勮寖椤?| 瑙勫垯 |
|--------|------|
| 涓婚鑹?| 钃濊壊 #2563eb锛堜富鑹诧級銆佺豢鑹?#10b981锛堟垚鍔燂級銆佺孩鑹?#ef4444锛堥敊璇級銆侀粍鑹?#f59e0b锛堣鍛婏級 |
| 瀛椾綋 | Inter / system-ui, sans-serif |
| 瀛楀彿 | 12px锛堣緟鍔╋級/ 14px锛堟鏂囷級/ 16px锛堟爣棰橈級/ 20px锛堥〉闈㈡爣棰橈級|
| 鍦嗚 | 4px锛堣緭鍏ユ锛? 8px锛堝崱鐗囷級/ 12px锛堝脊绐楋級|
| 闂磋窛 | 4-8-12-16-24-32 閫掕繘浣撶郴 |
| 鍥炬爣 | Lucide React 鍥炬爣搴?|
| 鍔ㄧ敾 | 娣″叆 200ms锛屾粦鍔?300ms锛岄鏋跺睆 1.5s pulse |

### 15.4 鍓嶇鍙樻洿

| 椤甸潰 | 鍙樻洿 |
|------|------|
| 鍓嶇椤圭洰 | 鏂板 components/ 鐩綍鏁寸悊锛屾寜 atomic design 鍒嗗眰 |
| Storybook | 鍙€夛細缁勪欢鏂囨。鍜?playground |

#### 15.5 API 鎺ュ彛

| 鏂规硶 | 璺緞 | 璇存槑 | 鏉冮檺 |
|------|------|------|------|
| GET | /api/v1/admin/components | 缁勪欢搴撳垪琛?| 绠＄悊鍛樹互涓?|
| GET | /api/v1/admin/components/:name | 缁勪欢璇︽儏锛圥rops/浣跨敤绀轰緥锛?| 绠＄悊鍛樹互涓?|
| GET | /api/v1/admin/components/usage-stats | 缁勪欢浣跨敤棰戠巼缁熻 | 绠＄悊鍛樹互涓?|

#### 15.6 鍔熻兘瑙勬牸琛?

| 妯″潡 | 璇存槑 |
|------|------|
| 缁勪欢鐩綍 | 鎸?atomic design 鍒嗗眰灞曠ず鎵€鏈夊叕鍏辩粍浠?|
| 缁勪欢璇︽儏 | 鏄剧ず缁勪欢 Props 瀹氫箟銆佷娇鐢ㄧず渚嬨€佷唬鐮佺墖娈?|
| 浣跨敤缁熻 | 缁熻鍚勭粍浠跺湪椤圭洰涓殑浣跨敤棰戠巼鍜屽紩鐢ㄩ〉闈?|
| 鎼滅储 | 鎸夌粍浠跺悕绉?鍏抽敭璇嶆悳绱?|

---

