import {
    ForwardedRef,
    forwardRef,
    useContext, useEffect,
    useImperativeHandle, useMemo, useRef, useState,
} from "react";
import {Primitive} from "resium";
import {
    BlendingState,
    Cartesian3,
    Color, ColorGeometryInstanceAttribute,
    GeometryInstance, Material,
    MaterialAppearance,
    PerInstanceColorAppearance,
    Rectangle,
    RectangleGeometry
} from "cesium";
import {countryContext} from "./CountryProvider.tsx";
import {Tile} from "../model/tiles.ts";
import {TileClicker} from "../backends/backend.ts";

type RegionProps = {
    tiles: Tile[]
    defaultColor: number
    onRegionReady?: () => void
    tileClicker: TileClicker
    index: number
}

export interface RegionHandle {
    handleTileClick(tileId: string): void;
}

export default forwardRef<RegionHandle, RegionProps>(
    function Region(
        props: RegionProps,
        ref: ForwardedRef<RegionHandle>
    ) {
        const tilesPerIdMemo = useMemo(() => {
            return new Map(props.tiles.map(tile => [tile.id(), tile]))
        }, [props.tiles])

        const [tilesPerId, setTilesPerId] = useState(new Map<string, Tile>())
        const {country} = useContext(countryContext)

        useEffect(() => {
            setTilesPerId(tilesPerIdMemo)
        }, [tilesPerIdMemo]);

        useImperativeHandle(ref, () => ({
            handleTileClick: (tileId: string) => {
                setTilesPerId((prev) => {
                    const newMap = new Map(prev)
                    const newTile = newMap.get(tileId)!.setCountryCode(country.code)
                    newMap.set(tileId, newTile)
                    return newMap
                })

                console.log("clicked on index", props.index)

                // call backend to save tile state
                props.tileClicker.clickTile(tileId, country.code).catch(console.error)
            },
        }))

        const [bindings, setBindings] = useState(new Map<string | undefined, Tile[]>())
        useEffect(() => {
            setBindings(() => {
                const newMap = new Map()
                tilesPerId.forEach((tile) => {
                    newMap.set(tile.getCountryCode(), [...(newMap.get(tile.getCountryCode()) || []), tile])
                })

                return newMap
            })
        }, [tilesPerId]);

        const renderedTerritoriesCount = useRef(0)
        const markRegionAsRendered = () => {
            renderedTerritoriesCount.current += 1
            if (renderedTerritoriesCount.current == bindings.size) {
                props.onRegionReady?.()
            }
        }

        return <>
            {Array.from(bindings).map(([country, tiles]) =>
                <Primitive
                    onReady={markRegionAsRendered}
                    key={tiles[0].id()}
                    geometryInstances={
                        tilesToGeometryInstances(tiles,
                            // (country) ? undefined : Color.WHITE.withAlpha(0.5),
                            (country) ? undefined : Color.fromRandom({alpha: 0.5})
                        )
                    }
                    appearance={
                        country ? new MaterialAppearance({
                            renderState: {
                                blending: BlendingState.ALPHA_BLEND
                            },
                            material: new Material({
                                fabric: {
                                    type: "Image",
                                    uniforms: {
                                        image: "/static/countries/1x1/" + country + ".svg",
                                        color: new Color(1, 1, 1, 0.5),
                                    }
                                }
                            }),
                            closed: true,
                            translucent: true,
                        }) : new PerInstanceColorAppearance({
                            flat: true,
                            translucent: true,
                        })
                    }
                    releaseGeometryInstances={true}
                />
            )}
        </>
    }
)

function tilesToGeometryInstances(tiles: Tile[], color?: Color): GeometryInstance[] {
    const attrs = color ? {color: ColorGeometryInstanceAttribute.fromColor(color)} : {}

    return tiles.map((tile: Tile) => {
        return new GeometryInstance({
            geometry: new RectangleGeometry({
                rectangle: Rectangle.fromCartesianArray(
                    Cartesian3.fromDegreesArray(tile.getBoundaries().map(coordinates => {
                        return [coordinates.lon, coordinates.lat]
                    }).flat())
                ),
                granularity: 1,
            }),
            attributes: attrs,
            id: tile.id(),
        })
    })
}
