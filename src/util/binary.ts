export const Binary = {
  search<T>(arr: T[] | undefined, target: string, accessor: (item: T) => string): { found: boolean; index: number } {
    if (!arr || arr.length === 0) return { found: false, index: 0 }
    let lo = 0
    let hi = arr.length - 1
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1
      const key = accessor(arr[mid])
      if (key < target) lo = mid + 1
      else if (key > target) hi = mid - 1
      else return { found: true, index: mid }
    }
    return { found: false, index: lo }
  },
}
