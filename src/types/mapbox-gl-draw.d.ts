// Déclaration minimale pour @mapbox/mapbox-gl-draw (utilisé avec MapLibre via alias webpack)
declare module '@mapbox/mapbox-gl-draw' {
  interface MapboxDrawOptions {
    displayControlsDefault?: boolean
    styles?: object[]
    modes?: Record<string, object>
    [key: string]: unknown
  }

  interface DrawFeatureCollection {
    type: 'FeatureCollection'
    features: GeoJSON.Feature[]
  }

  class MapboxDraw {
    static modes: Record<string, object>
    constructor(options?: MapboxDrawOptions)
    changeMode(mode: string, options?: object): void
    add(feature: GeoJSON.Feature | DrawFeatureCollection): string[]
    get(id: string): GeoJSON.Feature | undefined
    getAll(): DrawFeatureCollection
    delete(ids: string | string[]): this
    deleteAll(): this
    set(featureCollection: DrawFeatureCollection): string[]
  }

  export default MapboxDraw
}

declare module '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css' {
  const content: string
  export default content
}
