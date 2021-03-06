import 'rxjs/add/operator/distinctUntilChanged';
import 'rxjs/add/operator/combineLatest';

import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import {
  ActionMode,
  ActionSource,
} from 'app/scripts/model/actionmode';
import { DemoService } from 'app/services/demos/demo.service';
import {
  FileImportService,
  ImportType,
} from 'app/services/import/fileimport.service';
import { ShortcutService } from 'app/services/shortcut/shortcut.service';
import {
  Duration,
  SnackBarService,
} from 'app/services/snackbar/snackbar.service';
import {
  State,
  Store,
} from 'app/store';
import { getActionMode } from 'app/store/actionmode/selectors';
import { ImportVectorLayers } from 'app/store/layers/actions';
import { ResetWorkspace } from 'app/store/reset/actions';
import * as erd from 'element-resize-detector';
import { environment } from 'environments/environment';
import * as $ from 'jquery';
import { BehaviorSubject } from 'rxjs/BehaviorSubject';
import { Observable } from 'rxjs/Observable';

const SHOULD_AUTO_LOAD_DEMO = false;
const IS_DEV_BUILD = !environment.production;
const ELEMENT_RESIZE_DETECTOR = erd();
const STORAGE_KEY_FIRST_TIME_USER = 'storage_key_first_time_user';

declare const ga: Function;

// TODO: show confirmation dialog when dropping a file into a dirty workspace
@Component({
  selector: 'app-root',
  templateUrl: './root.component.html',
  styleUrls: ['./root.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RootComponent implements OnInit, AfterViewInit, OnDestroy {
  readonly ACTION_SOURCE_FROM = ActionSource.From;
  readonly ACTION_SOURCE_ANIMATED = ActionSource.Animated;
  readonly ACTION_SOURCE_TO = ActionSource.To;

  @ViewChild('displayContainer') displayContainerRef: ElementRef;
  private $displayContainer: JQuery;

  private readonly displayBoundsSubject = new BehaviorSubject<Size>({ w: 1, h: 1 });
  canvasBounds$: Observable<Size>;
  isActionMode$: Observable<boolean>;

  constructor(
    private readonly snackBarService: SnackBarService,
    private readonly fileImporterService: FileImportService,
    private readonly store: Store<State>,
    private readonly shortcutService: ShortcutService,
    private readonly demoService: DemoService,
  ) { }

  ngOnInit() {
    this.shortcutService.init();

    // TODO: we should check to see if there are any dirty changes first
    $(window).on('beforeunload', event => {
      if (!IS_DEV_BUILD) {
        return 'You\'ve made changes but haven\'t saved. ' +
          'Are you sure you want to navigate away?';
      }
      return undefined;
    });

    const displaySize$ = this.displayBoundsSubject.asObservable()
      .distinctUntilChanged(({ w: w1, h: h1 }, { w: w2, h: h2 }) => {
        return w1 === w2 && h1 === h2;
      });
    this.isActionMode$ = this.store.select(getActionMode).map(mode => mode !== ActionMode.None);
    this.canvasBounds$ = Observable.combineLatest(displaySize$, this.isActionMode$)
      .map(([{ w, h }, shouldShowThreeCanvases]) => {
        return { w: w / (shouldShowThreeCanvases ? 3 : 1), h };
      });
  }

  ngAfterViewInit() {
    this.$displayContainer = $(this.displayContainerRef.nativeElement);
    ELEMENT_RESIZE_DETECTOR.listenTo(this.$displayContainer.get(0), el => {
      const w = this.$displayContainer.width();
      const h = this.$displayContainer.height();
      this.displayBoundsSubject.next({ w, h });
    });

    if ('serviceWorker' in navigator) {
      const isFirstTimeUser = window.localStorage.getItem(STORAGE_KEY_FIRST_TIME_USER);
      if (!isFirstTimeUser) {
        window.localStorage.setItem(STORAGE_KEY_FIRST_TIME_USER, 'true');
        setTimeout(() => {
          this.snackBarService.show('Ready to work offline', 'Dismiss', Duration.Long);
        });
      }
    }

    if (IS_DEV_BUILD && SHOULD_AUTO_LOAD_DEMO) {
      this.demoService.getDemo('demos/hippobuffalo.shapeshifter')
        .then(({ vectorLayer, animations, hiddenLayerIds }) => {
          this.store.dispatch(new ResetWorkspace(vectorLayer, animations, hiddenLayerIds));
        });
    }
  }

  ngOnDestroy() {
    ELEMENT_RESIZE_DETECTOR.removeAllListeners(this.$displayContainer.get(0));
    this.shortcutService.destroy();
    $(window).unbind('beforeunload');
  }

  // Called by the DropTargetDirective.
  onDropFiles(fileList: FileList) {
    this.fileImporterService.import(
      fileList,
      (importType, vls, animations, hiddenLayerIds) => {
        if (importType === ImportType.Json) {
          ga('send', 'event', 'Import', 'JSON', 'Drag/drop');
          this.store.dispatch(new ResetWorkspace(vls[0], animations, hiddenLayerIds));
        } else {
          if (importType === ImportType.Svg) {
            ga('send', 'event', 'Import', 'SVG', 'Drag/drop');
          } else if (importType === ImportType.VectorDrawable) {
            ga('send', 'event', 'Import', 'Vector Drawable', 'Drag/drop');
          }
          this.store.dispatch(new ImportVectorLayers(vls));
          this.snackBarService.show(
            `Imported ${vls.length} path${vls.length === 1 ? '' : 's'}`,
            'Dismiss',
            Duration.Short);
        }
      },
      () => {
        this.snackBarService.show(`Couldn't import the file`, 'Dismiss', Duration.Long);
      });
  }
}

interface Size {
  readonly w: number;
  readonly h: number;
}
