import * as _ from 'lodash';
import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs/BehaviorSubject';
import { CanvasType } from '../CanvasType';
import { StateService } from './state.service';
import { PathUtil } from '../scripts/paths';

/**
 * A simple service that broadcasts selection events to all parts of the application.
 * TODO: clear selections in an onBlur callback somehow
 */
@Injectable()
export class SelectionService {
  private readonly source = new BehaviorSubject<ReadonlyArray<Selection>>([]);

  asObservable() {
    return this.source.asObservable();
  }

  getSelections() {
    return this.source.getValue();
  }

  getSelectedSubPathIndices(restrictToCanvasType?: CanvasType) {
    return this.getSelections()
      .filter(s => {
        return s.type === SelectionType.SubPath
          && (restrictToCanvasType === undefined || s.source === restrictToCanvasType);
      })
      .map(s => s.subIdx);
  }

  isSubPathIndexSelected(subIdx: number, restrictToCanvasType?: CanvasType) {
    return this.getSelections().some(selection => {
      const type = SelectionType.SubPath;
      if (restrictToCanvasType === undefined) {
        return areSelectionsEqual(selection, { type, source: CanvasType.Start, subIdx })
          || areSelectionsEqual(selection, { type, source: CanvasType.End, subIdx });
      }
      return areSelectionsEqual(selection, { type, source: restrictToCanvasType, subIdx });
    });
  }

  isSegmentSelected(subIdx: number, cmdIdx: number, restrictToCanvasType?: CanvasType) {
    return this.getSelections().some(selection => {
      const type = SelectionType.Segment;
      if (restrictToCanvasType === undefined) {
        return areSelectionsEqual(selection, { type, source: CanvasType.Start, subIdx, cmdIdx })
          || areSelectionsEqual(selection, { type, source: CanvasType.End, subIdx, cmdIdx });
      }
      return areSelectionsEqual(selection, { type, source: restrictToCanvasType, subIdx, cmdIdx });
    });
  }

  isPointSelected(subIdx: number, cmdIdx: number, restrictToCanvasType?: CanvasType) {
    return this.getSelections().some(selection => {
      const type = SelectionType.Point;
      if (restrictToCanvasType === undefined) {
        return areSelectionsEqual(selection, { type, source: CanvasType.Start, subIdx, cmdIdx })
          || areSelectionsEqual(selection, { type, source: CanvasType.End, subIdx, cmdIdx });
      }
      return areSelectionsEqual(selection, { type, source: restrictToCanvasType, subIdx, cmdIdx });
    });
  }

  private setSelections(selections: Selection[]) {
    this.source.next(selections);
  }

  toggleSubPath(source: CanvasType, subIdx: number) {
    const selections = this.getSelections().slice();
    _.remove(selections, sel => sel.type !== SelectionType.SubPath && sel.source !== source);
    this.toggleSelections(
      selections,
      [{ type: SelectionType.SubPath, source, subIdx }]);
  }

  toggleSegments(
    source: CanvasType,
    segments: ReadonlyArray<{ subIdx: number, cmdIdx: number }>,
    appendToList = false) {

    const selections = this.getSelections().slice();
    _.remove(selections, sel => sel.type !== SelectionType.Segment);
    this.toggleSelections(
      selections,
      segments.map(seg => {
        const { subIdx, cmdIdx } = seg;
        return { type: SelectionType.Segment, source, subIdx, cmdIdx };
      }),
      appendToList);
  }

  togglePoint(source: CanvasType, subIdx: number, cmdIdx: number, appendToList = false) {
    const selections = this.getSelections().slice();
    _.remove(selections, sel => sel.type !== SelectionType.Point && sel.source !== source);
    this.toggleSelections(
      selections,
      [{ type: SelectionType.Point, source, subIdx, cmdIdx }],
      appendToList);
  }

  /**
    * Toggles the specified selections. If a selection exists, all selections will be
    * removed from the list. Otherwise, they will be added to the list of selections.
    * By default, all other selections from the list will be cleared.
    */
  private toggleSelections(
    currentSelections: Selection[],
    newSelections: Selection[],
    appendToList = false) {

    const matchingSelections = _.remove(currentSelections, currSel => {
      // Remove any selections that are equal to a new selection.
      return newSelections.some(newSel => areSelectionsEqual(newSel, currSel));
    });
    if (!matchingSelections.length) {
      // If no selections were removed, then add all of the selections to the list.
      currentSelections.push(...newSelections);
    }
    if (!appendToList) {
      // If we aren't appending multiple selections at a time, then clear
      // any previous selections from the list.
      _.remove(currentSelections, currSel => {
        return newSelections.every(newSel => !areSelectionsEqual(currSel, newSel));
      });
    }
    this.source.next(currentSelections);
  }


  /**
   * Clears the current list of selections.
   */
  reset() {
    this.setSelections([]);
  }
}

/**
 * A selection represents an action that is the result of a mouse click.
 */
export interface Selection {
  readonly type: SelectionType;
  readonly source: CanvasType;
  readonly subIdx: number;
  readonly cmdIdx?: number;
}

/**
 * Describes the different types of selection events.
 */
export enum SelectionType {
  // The user selected an entire subpath.
  SubPath = 1,
  // The user selected an individual segment in a subpath.
  Segment,
  // The user selected an individual point in a subpath.
  Point,
}

function areSelectionsEqual(sel1: Selection, sel2: Selection) {
  return sel1.source === sel2.source
    && sel1.type === sel2.type
    && sel1.subIdx === sel2.subIdx
    && sel1.cmdIdx === sel2.cmdIdx;
}

/**
 * Deletes any currently selected split points.
 */
export function deleteSelectedSplitPoints(
  lss: StateService,
  sss: SelectionService) {

  const selections = sss.getSelections();
  if (!selections.length) {
    return;
  }
  // Preconditions: all selections exist in the same editor.
  const canvasType = selections[0].source;
  const activePathLayer = lss.getActivePathLayer(canvasType);
  const unsplitOpsMap: Map<number, Array<{ subIdx: number, cmdIdx: number }>> = new Map();
  for (const selection of selections) {
    const { subIdx, cmdIdx } = selection;
    if (!activePathLayer.pathData.getSubPaths()[subIdx].getCommands()[cmdIdx].isSplitPoint()) {
      continue;
    }
    let subIdxOps = unsplitOpsMap.get(subIdx);
    if (!subIdxOps) {
      subIdxOps = [];
    }
    subIdxOps.push({ subIdx, cmdIdx });
    unsplitOpsMap.set(subIdx, subIdxOps);
  }
  sss.reset();
  const mutator = activePathLayer.pathData.mutate();
  unsplitOpsMap.forEach((ops, idx) => {
    // TODO: perform these as a single batch instead of inside a loop? (to reduce # of broadcasts)
    PathUtil.sortPathOps(ops);
    for (const op of ops) {
      mutator.unsplitCommand(op.subIdx, op.cmdIdx);
    }
  });
  lss.updateActivePath(canvasType, mutator.build());
}
