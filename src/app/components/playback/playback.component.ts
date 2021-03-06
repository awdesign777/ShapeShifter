import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
} from '@angular/core';
import { AnimatorService } from 'app/services/animator/animator.service';
import {
  State,
  Store,
} from 'app/store';
import { getPlaybackState } from 'app/store/playback/selectors';
import { Observable } from 'rxjs/Observable';

@Component({
  selector: 'app-playback',
  templateUrl: './playback.component.html',
  styleUrls: ['./playback.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlaybackComponent implements OnInit {

  playbackModel$: Observable<PlaybackModel>;

  constructor(
    private readonly store: Store<State>,
    private readonly animatorService: AnimatorService,
  ) { }

  ngOnInit() {
    this.playbackModel$ = this.store.select(getPlaybackState);
  }

  isSlowMotionClick() {
    this.animatorService.toggleIsSlowMotion();
  }

  playPauseButtonClick() {
    this.animatorService.toggleIsPlaying();
  }

  rewindClick() {
    this.animatorService.rewind();
  }

  fastForwardClick() {
    this.animatorService.fastForward();
  }

  isRepeatingClick() {
    this.animatorService.toggleIsRepeating();
  }
}

interface PlaybackModel {
  readonly isSlowMotion: boolean;
  readonly isPlaying: boolean;
  readonly isRepeating: boolean;
}
